// Kanallarda yayınla: ürün bir kez girilir, bağlı tüm kanallarda tek tıkla yayınlanır.
// Pazaryerleri (Trendyol, Hepsiburada, N11, idefix …): kategori eşleştirmesi (catalog.js) + ürüne özel özellikler (product_attrs) +
// marka eşleştirmesi (brand_map) + kanal seçenekleri (upload_opts) ile kanalın ürün servisine gider; sonuç takip kimliğiyle sorgulanır.
// Siteler (ikas, Shopify, WooCommerce): ürün (varyantlarıyla) hemen açılır.
// Her ürünün her kanaldaki durumu product_channel'da: ready | sent | live | rejected | error.
//   GET  catalog/preflight?ids=&channels=   hazır mı, eksikler, önerilen kategori, zorunlu özellikler, marka, kanal seçenekleri
//   POST catalog/preflight {…taslak}        aynı kontrol, kaydetmeden (kullanıcı alanları doldururken)
//   POST catalog/publish {ids, channels, approve, attrs, pattrs, brands, opts, retry}
//   GET  catalog/publish/status?ids=        durumlar (gönderilmiş olanların sonucu kanaldan sorgulanır)
//   GET  catalog/brands?channel=&q=&category=
import { all, first, run, allIn, getRaw, setSetting, getSettings, log } from './db.js';
import { getChannels } from './channels/index.js';
import { fail, str, num, brandKey } from './util.js';
import { markupPct, cleanMarkup, AUTO_MAP_SQL } from './catalog.js';
import { exclusive } from './locks.js';
import { rank } from './catmatch.js';
import { shape, picker, groupCode, namesOf, confident, autoAttrs, checkUpload, markSent, productsFor, originOf, withOrigin, staleCheck, clearSuggest, STALE_MSG, variantAxes, autoFill, inferBrand } from './catalog.js';
import { HELD_SQL } from './sync.js';

// Kanalın bir kez sorulan zorunlu seçenekleri (Ürün yükle → kanal seçenekleri ile aynı yer: upload_opts). Üçüncü değer: ürünün kendi alanı varsa o kullanılır.
const NEED = {
  n11: [['shipmentTemplate', 'Kargo şablonu'], ['preparingDay', 'Kargoya veriliş süresi (gün)', 'preparing_days']],
  trendyol: [['cargoCompanyId', 'Kargo firması numarası']],
  idefix: [['cargoCompanyId', 'Kargo firması numarası']],
  hepsiburada: [['warranty', 'Garanti süresi (ay)', 'warranty_months']],
};
const MAX = 200;
const cap = (s) => (s ? s.charAt(0).toLocaleUpperCase('tr') + s.slice(1) : s);
const vnorm = (s) => String(s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
const kindOf = (c) => (c.catalog ? 'market' : c.createProduct && (c.caps || {}).createProduct ? 'store' : null);
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

async function targets(env, db, only) {
  return (await getChannels(env, db)).filter((c) => !c.paused && c.enabled && (kindOf(c) || (c.hold && (c.real || c).catalog)) && (!only || only.includes(c.id)));
}
const idsOf = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(',')).map(Number).filter((x) => Number.isInteger(x) && x > 0))];
const listOf = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map(str).filter(Boolean);

// Seçili ürünler + aynı ana ürünün (varyant grubu) diğer varyantları: bir grup kanala birlikte gider
async function expand(db, ids) {
  if (!ids.length) fail(400, 'Ürün seçin');
  const base = await allIn(db, ids, (ph, part) => [`SELECT id, sku, model_code, parent_key, group_name FROM products WHERE id IN (${ph})`, part]);
  const codes = new Set(base.map(groupCode).filter(Boolean)), out = new Set(base.map((p) => p.id));
  const by = async (col, vals) => (vals.length ? allIn(db, vals, (ph, part) => [`SELECT id, sku, model_code, parent_key, group_name FROM products WHERE active = 1 AND ${col} IN (${ph})`, part]) : []);
  const uniq = (f) => [...new Set(base.map(f).filter(Boolean))];
  for (const p of [...await by('model_code', uniq((p) => str(p.model_code))), ...await by('parent_key', uniq((p) => str(p.parent_key))), ...await by('group_name', uniq((p) => str(p.group_name)))]) {
    if (codes.has(groupCode(p))) out.add(p.id);
  }
  if (out.size > MAX) fail(400, `Tek seferde en fazla ${MAX} ürün (varyantlar dahil)`);
  return [...out];
}

// Kaydedilmiş ürüne özel değerler: { pid: { ch: { attr: {id, value} } } }
async function savedAttrs(db, ids) {
  const out = {};
  for (const r of await allIn(db, ids, (ph, part) => [`SELECT * FROM product_attrs WHERE product_id IN (${ph})`, part])) {
    ((out[r.product_id] = out[r.product_id] || {})[r.channel] = out[r.product_id][r.channel] || {})[r.attr_id] = { id: r.value_id || undefined, value: r.value || '' };
  }
  return out;
}

// ---------- hazırlık kontrolü ----------
// draft: kullanıcının henüz kaydetmediği seçimler (approve / attrs / pattrs / brands / opts)
async function plan(env, db, { ids, channels, draft = {}, build = false }) {
  const settings = await getSettings(db);
  const all0 = await expand(db, ids);
  const chans = await targets(env, db, channels);
  const allOpts = (await getRaw(db, 'upload_opts')) || {};
  const saved = await savedAttrs(db, all0);
  const states = new Map((await allIn(db, all0, (ph, part) => [`SELECT * FROM product_channel WHERE product_id IN (${ph})`, part])).map((r) => [`${r.product_id}|${r.channel}`, r]));
  const brandRows = new Map((await all(db, 'SELECT * FROM brand_map')).map((r) => [`${r.brand}|${r.channel}`, r]));
  const out = { products: [], channels: [] };
  let first = true;
  for (const c of chans) {
    const kind = kindOf(c);
    const prods = await productsFor(db, settings, { ch: c.id, ids: all0 });
    if (first) {
      out.products = prods.map((p) => ({ id: p.id, name: p.name, group_name: p.group_name, variant_name: p.variant_name, sku: p.sku, barcode: p.barcode, image: p.image, brand: p.brand, category: p.category, group: groupCode(p) }));
      first = false;
    }
    const row = { id: c.id, name: c.name, kind, disabled: c.hold ? 'Beklemede' : '', options: [], cats: [], items: [], counts: {}, brandSearch: !!(c.catalog && c.catalog.brands), brandByCategory: !!(c.catalog && c.catalog.brandByCategory) };
    out.channels.push(row);
    if (c.hold) { row.items = prods.map((p) => ({ id: p.id, state: 'off', missing: ['Kanal beklemede'] })); continue; }
    const dOpts = { ...(allOpts[c.id] || {}), ...((draft.opts || {})[c.id] || {}) };
    const need = kind === 'market' ? NEED[c.type] || [] : [];
    const optsFor = (p) => {
      const o = { ...dOpts };
      if (num(p.preparing_days) > 0) { o.preparingDay = num(p.preparing_days); o.deliveryDuration = o.deliveryDuration || num(p.preparing_days); }
      if (num(p.warranty_months) > 0) o.warranty = num(p.warranty_months);
      return o;
    };
    const optMissing = (o) => need.filter(([k]) => str(o[k]) === '').map(([, label]) => label);
    row.options = need.map(([k, label, own]) => ({ k, label, value: str(dOpts[k]), need: prods.some((p) => str(optsFor(p)[k]) === ''), own: !!own }));
    // Pazaryeri fiyat farkı (%): site fiyatının üstüne eklenir, yalnız ilk gönderimde (Ürün yükle → Kanal ayarları ile aynı ayar)
    if (kind === 'market') row.markup = markupPct(dOpts.markup);

    if (kind === 'store') {
      const groups = new Map();
      for (const p of prods) { const g = groupCode(p) || 'p' + p.id; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(p); }
      for (const [, list] of groups) {
        const live = list.some((p) => p.listed);
        const names = list.map((p) => vnorm(p.variant_name || p.name));
        for (const p of list) {
          const missing = [];
          if (!str(p.name)) missing.push('Ürün adı');
          if (!(num(p.sale_price) > 0)) missing.push('Fiyat');
          if (list.length > 1 && names.filter((x) => x === vnorm(p.variant_name || p.name)).length > 1) missing.push('Varyant adı (her varyantta farklı olmalı)');
          if (live && !p.listed) missing.push('Ana ürün sitede var; yeni varyantı siteden ekleyin');
          row.items.push(itemState(p, c, states, missing));
        }
      }
      row.counts = counts(row.items);
      continue;
    }

    // Pazaryeri: kategori → özellikler → marka → ürün dosyası
    const maps = new Map((await all(db, 'SELECT * FROM category_map WHERE channel = ?', c.id)).map((m) => [m.local, { ...m, attrs: parse(m.attrs, {}) }]));
    const sugs = new Map((await all(db, 'SELECT * FROM category_suggest WHERE channel = ? AND remote_id IS NOT NULL', c.id)).map((s) => [s.local, s]));
    const appr = (draft.approve || {})[c.id] || {};
    let catList = null;
    const allCats = async () => { if (!catList) catList = c.catalog.allCategories ? await c.catalog.allCategories().catch(() => []) : []; return catList; };
    const catBox = new Map(), schema = new Map(), autoA = new Map(), picks = new Map(), brandCache = new Map();
    const schemaOf = async (catId) => {
      if (!schema.has(catId)) {
        const list = (await c.catalog.attributes(catId).catch(() => [])).filter((a) => a.mandatory || a.kind === 'variant').filter((a) => !/g[öo]rsel|resim|foto|image/i.test(a.name || '') || /enum|list|select/i.test(a.type || ''));
        list.sort((a, b) => Number(!!b.mandatory) - Number(!!a.mandatory) || (b.kind === 'variant') - (a.kind === 'variant'));
        for (const a of list) {
          if (/enum|list|select/i.test(a.type || '') || (!a.custom && a.type !== 'text')) {
            const vals = await c.catalog.values(catId, a.id).catch(() => []);
            a.values = vals.slice(0, 300); a.more = vals.length > 300;
          }
        }
        schema.set(catId, list);
      }
      return schema.get(catId);
    };
    const autoOf = async (catId) => { if (!autoA.has(catId)) autoA.set(catId, (await autoAttrs(c, catId, { origin: originOf(settings) }).catch(() => ({ attrs: {} }))).attrs); return autoA.get(catId); };
    let staleOf = null;
    const pickOf = (catId) => { if (!picks.has(catId)) picks.set(catId, picker(c, catId)); return picks.get(catId); };
    // Ürünün kategorisi: ürüne özel seçim → taslak onay → kategori eşleştirmesi → öneri
    async function catFor(p) {
      const local = str(p.category), own = ((saved[p.id] || {})[c.id] || {})['@category'];
      const key = local && !own ? 'l:' + local : 'p:' + p.id;
      const d = (appr.cats || {})[key] || (appr.category ? { id: appr.category, name: appr.name } : null);
      if (d && str(d.id)) {
        // Sistemin eşleştirdiği kategori aynen onaylanıyor: onun özellik değerleri kullanılır
        const am = local && !own && maps.get(local), same = am && /^Otomatik/.test(str(am.user)) && String(am.remote_id) === str(d.id);
        return { key, local, remote_id: str(d.id), name: str(d.name), state: 'mapped', draft: true, product: !local || !!own || (maps.has(local) && !same), ...(same ? { attrs: am.attrs } : {}) };
      }
      if (own && own.id) return { key, local, remote_id: own.id, name: own.value, state: 'mapped', product: true };
      const m = local && maps.get(local);
      // Sistemin kendi onayladığı eşleşme ("Otomatik (kesin)"): elle gönderimde de kişinin onayı istenir (öneri olarak gelir)
      if (m && /^Otomatik/.test(str(m.user))) return { key, local, remote_id: m.remote_id, name: m.remote_name, path: '', state: 'suggested', sure: true, auto: true, alts: [] };
      if (m) {
        if (!staleOf) staleOf = await staleCheck(c);
        return { key, local, remote_id: m.remote_id, name: m.remote_name, state: 'mapped', attrs: m.attrs, ...(staleOf(m.remote_id) ? { stale: true } : {}) };
      }
      if (catBox.has(key)) return catBox.get(key);
      const sg = local && sugs.get(local);
      const text = local || str(p.group_name) || str(p.name);
      const r = text ? rank(await allCats(), text, local ? await namesOf(db, local) : [p.name], 4) : [];
      const best = sg ? { id: sg.remote_id, name: sg.remote_name, path: sg.path } : r[0];
      const box = best ? { key, local, remote_id: String(best.id), name: best.name, path: best.path || '', state: 'suggested', sure: sg ? !!sg.sure : confident(r), alts: r.filter((x) => String(x.id) !== String(best.id)).slice(0, 3).map((x) => ({ id: String(x.id), name: x.name, path: x.path || '' })) }
        : { key, local, state: 'none', alts: [] };
      catBox.set(key, box);
      return box;
    }
    // Marka alanı boş ürün: paneldeki markalardan yalnız biri adında geçiyorsa o (bkz. catalog.js inferBrand)
    const known = prods.some((p) => !str(p.brand)) ? (await all(db, "SELECT DISTINCT brand FROM products WHERE COALESCE(TRIM(brand), '') != ''")).map((r) => r.brand) : [];
    async function brandFor(p0, catId) {
      const p = !str(p0.brand) && known.length && inferBrand(p0.name, known) ? { ...p0, brand: inferBrand(p0.name, known) } : p0;
      const dB = (draft.brands || {})[c.id] || {};
      const pick = dB.remote_id ? dB : dB[p.brand || ''];
      if (pick && str(pick.remote_id)) return { state: 'ok', remote_id: str(pick.remote_id), name: str(pick.name), draft: true };
      if (!row.brandSearch) return p.brand ? { state: 'ok', name: p.brand } : { state: 'missing' };
      if (!p.brand) return { state: 'missing', options: [] };
      const m = brandRows.get(`${p.brand}|${c.id}`);
      if (m && m.remote_id) return { state: 'ok', remote_id: m.remote_id, name: m.remote_name };
      if (row.brandByCategory && !catId) return { state: 'missing', options: [] };
      const ck = p.brand + '|' + (row.brandByCategory ? catId : '');
      if (!brandCache.has(ck)) {
        let opts = [];
        try { opts = await c.catalog.brands(p.brand, catId); } catch (e) { if (e.budget) throw e; }
        const hit = opts.find((b) => brandKey(b.name) === brandKey(p.brand));
        // Adı birebir aynı marka: eşleşme hatırlanır (bir daha sorulmaz)
        if (hit && !row.brandByCategory) {
          await run(db, 'INSERT INTO brand_map (brand, channel, remote_id, remote_name) VALUES (?, ?, ?, ?) ON CONFLICT (brand, channel) DO UPDATE SET remote_id = excluded.remote_id, remote_name = excluded.remote_name', p.brand, c.id, hit.id, hit.name);
          brandRows.set(`${p.brand}|${c.id}`, { remote_id: hit.id, remote_name: hit.name });
        }
        brandCache.set(ck, hit ? { state: 'ok', remote_id: hit.id, name: hit.name, auto: true } : { state: 'missing', options: opts.slice(0, 8) });
      }
      return brandCache.get(ck);
    }
    const catRows = new Map();
    for (const p of prods) {
      const cat = await catFor(p);
      const missing = [];
      let vals = {}, payload = null, key = null, brand = { state: 'ok' };
      if (cat.state === 'none') missing.push('Kategori');
      else {
        if (cat.state === 'suggested') missing.push('Kategori onayı');
        if (cat.stale) missing.push(STALE_MSG);
        const sch = await schemaOf(cat.remote_id);
        if (!catRows.has(cat.key)) catRows.set(cat.key, { key: cat.key, local: cat.local, remote_id: cat.remote_id, name: cat.name, path: cat.path || '', state: cat.state, sure: !!cat.sure, alts: cat.alts || [], attrs: sch, products: [] });
        catRows.get(cat.key).products.push(p.id);
        // Özellikler: kategori eşleştirmesi (ya da önerilen kategorinin otomatik değerleri) + ürüne özel kayıtlı değerler + taslak
        const base = cat.attrs || (await autoOf(cat.remote_id));
        const own = { ...((saved[p.id] || {})[c.id] || {}) };
        delete own['@category'];
        const dA = { ...((draft.attrs || {})[c.id] || {}), ...(((draft.pattrs || {})[p.id] || {})[c.id] || {}) };
        const map = { local: cat.local, channel: c.id, remote_id: cat.remote_id, remote_name: cat.name, attrs: { ...(await withOrigin(c, cat.remote_id, base, p)), ...own } };
        for (const [aid, v] of Object.entries(dA)) {
          const a = sch.find((x) => String(x.id) === String(aid));
          if (!a) continue;
          const r = resolveVal(a, v);
          if (r) map.attrs[aid] = r; else delete map.attrs[aid];
        }
        const pick = pickOf(cat.remote_id);
        for (const a of sch) {
          const v = map.attrs[a.id];
          if (!v) continue;
          if (v.value === '@variant') { const hit = p.variant_name ? await pick(a, p.variant_name) : null; vals[a.id] = hit ? { id: hit.id, value: hit.value, from: 'variant' } : { value: str(p.variant_name), from: 'variant', bad: !a.custom || variantAxes(p.variant_name).length > 1 }; }
          else if (v.value !== '@image') vals[a.id] = { id: v.id, value: v.value, from: own[a.id] || dA[a.id] ? 'product' : 'category' };
        }
        brand = await brandFor(p, cat.remote_id);
        const o = optsFor(p);
        const pr = shape(p, o, false);
        if (brand.remote_id) pr.brandId = brand.remote_id;
        if (brand.name && brand.state === 'ok' && (brand.remote_id || !row.brandSearch)) pr.brand = brand.name;
        try {
          let b = await c.catalog.build(pr, map, { opts: o, pick });
          // Eksik zorunlu özellik ürün adından / kategorisinden kesin algılanırsa doldurulur (bkz. catalog.js inferValue)
          if (b.missing.length) {
            const f = await autoFill(c, cat.remote_id, map, p, b.missing);
            if (f.filled.length) {
              b = await c.catalog.build(pr, { ...map, attrs: f.attrs }, { opts: o, pick });
              for (const x of f.filled) vals[x.attr] = { id: f.attrs[x.attr].id, value: x.value, from: 'auto' };
            }
          }
          key = b.key; payload = b.payload;
          for (const m of b.missing) {
            if (/^marka/i.test(m) || /\(Ürün yükle[^)]*seçenekleri\)/i.test(m)) continue;
            missing.push(cap(m.replace(/\s*\(Ürün yükle[^)]*\)/i, '')));
          }
        } catch (e) { missing.push('Hata: ' + e.message); }
        if (brand.state !== 'ok') missing.push('Marka');
        missing.push(...optMissing(o));
      }
      const it = itemState(p, c, states, [...new Set(missing)]);
      Object.assign(it, { cat: cat.key, brand, vals });
      if (build) Object.assign(it, { payload, key, name: p.name });
      row.items.push(it);
    }
    row.cats = [...catRows.values()];
    for (const cat of catBox.values()) if (!catRows.has(cat.key)) row.cats.push({ ...cat, attrs: [], products: prods.filter((p) => ('l:' + str(p.category)) === cat.key || ('p:' + p.id) === cat.key).map((p) => p.id) });
    row.counts = counts(row.items);
  }
  return out;
}
// Taslak değer → { id, value }: listeden seçildiyse kimlik, yazıldıysa listede aynı adlı değer, yoksa serbest metin
function resolveVal(a, v) {
  if (v == null || v === '') return null;
  const o = typeof v === 'object' ? { id: str(v.id), value: str(v.value) } : { id: '', value: str(v) };
  if (o.value === '@variant') return { value: '@variant' };
  const list = a.values || [];
  if (o.id) { const hit = list.find((x) => String(x.id) === o.id); return { id: o.id, value: hit ? hit.value : o.value }; }
  if (!o.value) return null;
  const hit = list.find((x) => vnorm(x.value) === vnorm(o.value));
  return hit ? { id: String(hit.id), value: hit.value } : { value: o.value };
}
function itemState(p, c, states, missing) {
  const s = states.get(`${p.id}|${c.id}`);
  let state = missing.length ? 'missing' : 'ready', error = null;
  // Kanal ilanı var ama kanal henüz yayına almadı (idefix: eksik bilgi / inceleme): kanal kaynaklı durum, nedeniyle
  if (p.listed && p.held) { const [hs, note] = String(p.held).split('|'); state = hs === 'rejected' ? 'rejected' : 'sent'; error = `${c.name} ${hs === 'rejected' ? 'onaylamadı' : 'onayı bekliyor'}${note ? `: ${note}` : ''} (kanal kaynaklı)`; }
  else if (p.listed) state = 'live';
  else if (s && ['sent', 'live'].includes(s.state)) state = s.state;
  else if (s && ['rejected', 'error'].includes(s.state)) { state = s.state; error = s.error; }
  return { id: p.id, state, missing, error, ref: s ? s.ref : null, at: s ? s.updated_at : null, listed: !!p.listed };
}
const counts = (items) => items.reduce((o, x) => { o[x.state] = (o[x.state] || 0) + 1; return o; }, {});

// ---------- taslakları kaydet ----------
async function saveDraft(env, db, ids, b, user) {
  const chans = await targets(env, db, null);
  const prods = await allIn(db, ids, (ph, part) => [`SELECT id, category, brand FROM products WHERE id IN (${ph})`, part]);
  const saved = await savedAttrs(db, ids);
  const st = [], t = Date.now();
  // Kanal seçenekleri (bir kez sorulur, kanalın tüm ürünlerinde kullanılır)
  const allOpts = (await getRaw(db, 'upload_opts')) || {};
  let optsChanged = false;
  for (const [cid, o] of Object.entries(b.opts || {})) {
    const c = chans.find((x) => x.id === cid);
    if (!c || !o || typeof o !== 'object') continue;
    const keys = new Set([...((c.catalog && c.catalog.options) || []).map((x) => x.k), ...(NEED[c.type] || []).map(([k]) => k), 'markup']);
    const cur = { ...(allOpts[cid] || {}) };
    for (const [k, v] of Object.entries(o)) {
      if (!keys.has(k)) continue;
      // Fiyat farkı: boş bırakılınca kayıtlı fark kaldırılır (önizlemedeki 0 ile gönderilen fiyat aynı olsun); geçersizse hata
      if (k === 'markup') { const m = cleanMarkup(v); if (m === '') { if ('markup' in cur) { delete cur.markup; optsChanged = true; } } else { cur.markup = m; optsChanged = true; } continue; }
      if (str(v) !== '') { cur[k] = str(v); optsChanged = true; }
    }
    allOpts[cid] = cur;
  }
  if (optsChanged) await setSetting(db, 'upload_opts', allOpts);
  for (const c of chans) {
    if (!c.catalog) continue;
    // Kategori onayı: ikas kategorisi henüz eşleşmemişse kategori eşleştirmesi (aynı kategorideki diğer ürünler de kullanır), yoksa ürüne özel
    const appr = (b.approve || {})[c.id];
    if (appr) {
      const maps = new Set((await all(db, `SELECT local FROM category_map WHERE channel = ? AND ${AUTO_MAP_SQL}`, c.id)).map((r) => r.local));
      const autoMaps = new Map((await all(db, `SELECT local, remote_id FROM category_map WHERE channel = ? AND NOT (${AUTO_MAP_SQL})`, c.id)).map((r) => [r.local, String(r.remote_id)]));
      const doneLocal = new Set();
      for (const p of prods) {
        const local = str(p.category), own = ((saved[p.id] || {})[c.id] || {})['@category'];
        const key = local && !own ? 'l:' + local : 'p:' + p.id;
        const d = (appr.cats || {})[key] || (appr.category ? { id: appr.category, name: appr.name } : null);
        if (!d || !str(d.id)) continue;
        if (local && !own && !maps.has(local)) {
          if (doneLocal.has(local)) continue;
          doneLocal.add(local);
          // Sistemin eşleştirdiği kategori aynen onaylandı: yalnız onaylayan yazılır (özellikleri korunur)
          if (autoMaps.get(local) === str(d.id)) {
            await run(db, 'UPDATE category_map SET user = ?, updated_at = ? WHERE local = ? AND channel = ?', user.name, t, local, c.id);
            await log(db, c.id, 'info', `${user.name}: sistemin eşleştirdiği kategori onaylandı (${local} → ${str(d.name)})`);
            continue;
          }
          const { attrs } = await autoAttrs(c, str(d.id), { origin: originOf(await getSettings(db)) }).catch(() => ({ attrs: {} }));
          await run(db, `INSERT INTO category_map (local, channel, remote_id, remote_name, attrs, updated_at, user) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (local, channel) DO UPDATE SET remote_id = excluded.remote_id, remote_name = excluded.remote_name, attrs = excluded.attrs, updated_at = excluded.updated_at, user = excluded.user`,
          local, c.id, str(d.id), str(d.name), JSON.stringify(attrs), t, user.name);
          await clearSuggest(db, local, c.id);
          await log(db, c.id, 'info', `${user.name}: kategori onaylandı (${local} → ${str(d.name)})`);
        } else {
          st.push(db.prepare(`INSERT INTO product_attrs (product_id, channel, attr_id, value_id, value) VALUES (?, ?, '@category', ?, ?)
            ON CONFLICT (product_id, channel, attr_id) DO UPDATE SET value_id = excluded.value_id, value = excluded.value`).bind(p.id, c.id, str(d.id), str(d.name)));
        }
      }
    }
    // Marka seçimi: panel markası → kanal markası (hatırlanır). Markası boş ürüne seçilen marka ürünün markası da olur.
    const br = (b.brands || {})[c.id];
    if (br && typeof br === 'object') {
      const pairs = br.remote_id ? [...new Set(prods.map((p) => p.brand || ''))].map((n) => [n, br]) : Object.entries(br);
      for (const [name, v] of pairs) {
        if (!v || !str(v.remote_id)) continue;
        const bn = name || str(v.name);
        if (!name) st.push(db.prepare("UPDATE products SET brand = ?, updated_at = ? WHERE COALESCE(brand, '') = '' AND id IN (SELECT value FROM json_each(?))").bind(bn, t, JSON.stringify(ids)));
        if (!c.catalog.brandByCategory) st.push(db.prepare('INSERT INTO brand_map (brand, channel, remote_id, remote_name) VALUES (?, ?, ?, ?) ON CONFLICT (brand, channel) DO UPDATE SET remote_id = excluded.remote_id, remote_name = excluded.remote_name').bind(bn, c.id, str(v.remote_id), str(v.name)));
        else for (const p of prods.filter((x) => (x.brand || '') === name)) st.push(db.prepare(`INSERT INTO product_attrs (product_id, channel, attr_id, value_id, value) VALUES (?, ?, '@brand', ?, ?)
          ON CONFLICT (product_id, channel, attr_id) DO UPDATE SET value_id = excluded.value_id, value = excluded.value`).bind(p.id, c.id, str(v.remote_id), str(v.name)));
      }
    }
  }
  if (st.length) for (let i = 0; i < st.length; i += 50) await db.batch(st.slice(i, i + 50));
  // Özellikler: kategorinin özelliği olan ürünlere ürüne özel değer olarak (çözümleme için kategorinin değer listesi kullanılır)
  const anyAttrs = Object.keys(b.attrs || {}).length || Object.keys(b.pattrs || {}).length;
  if (anyAttrs) {
    const p0 = await plan(env, db, { ids, channels: [...new Set([...Object.keys(b.attrs || {}), ...Object.values(b.pattrs || {}).flatMap((x) => Object.keys(x || {}))])], draft: { approve: b.approve } });
    const st2 = [];
    for (const row of p0.channels) {
      for (const it of row.items) {
        const cat = row.cats.find((x) => x.key === it.cat);
        if (!cat) continue;
        const dA = { ...((b.attrs || {})[row.id] || {}), ...(((b.pattrs || {})[it.id] || {})[row.id] || {}) };
        for (const [aid, v] of Object.entries(dA)) {
          const a = cat.attrs.find((x) => String(x.id) === String(aid));
          if (!a) continue;
          const r = resolveVal(a, v);
          if (!r) st2.push(db.prepare('DELETE FROM product_attrs WHERE product_id = ? AND channel = ? AND attr_id = ?').bind(it.id, row.id, String(aid)));
          else st2.push(db.prepare(`INSERT INTO product_attrs (product_id, channel, attr_id, value_id, value) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (product_id, channel, attr_id) DO UPDATE SET value_id = excluded.value_id, value = excluded.value`).bind(it.id, row.id, String(aid), r.id || null, r.value || null));
        }
      }
    }
    for (let i = 0; i < st2.length; i += 50) await db.batch(st2.slice(i, i + 50));
  }
}

// ---------- gönder ----------
async function publish(env, db, ctx, b, user) {
  const ids = await expand(db, idsOf(b.ids));
  const only = listOf(b.channels), retry = new Set(listOf(b.retry));
  // Çift tıklama / iki kullanıcı: ürün başına kilit (aynı ürün aynı anda iki kez gönderilmez); kilit alınınca durum yeniden okunur,
  // gönderilmiş ya da yayında olan ürün bir daha gönderilmez
  const keys = [...ids].sort((a, b2) => a - b2).map((id) => 'publish:' + id);
  const lockAll = (ks, fn) => (ks.length ? exclusive(db, ks[0], () => lockAll(ks.slice(1), fn), { ttl: 120e3, busy: 'Bu ürün şu an gönderiliyor; birkaç saniye sonra durumuna bakın.' }) : fn());
  return lockAll(keys, async () => {
    await saveDraft(env, db, ids, b, user);
    // Markası boş ürüne seçilen marka da kaydedildi: kanallarda ürünler yeniden okunur
    const p = await plan(env, db, { ids, channels: only.length ? only : null, draft: {}, build: true });
    const results = {};
    const chans = await getChannels(env, db);
    for (const row of p.channels) {
      const c = chans.find((x) => x.id === row.id);
      const go = row.items.filter((x) => !x.missing.length && (x.state === 'ready' || (retry.has(row.id) && ['rejected', 'error'].includes(x.state))));
      const skipped = row.items.filter((x) => x.missing.length && !['sent', 'live'].includes(x.state)).map((x) => ({ id: x.id, missing: x.missing }));
      results[row.id] = { sent: 0, live: 0, skipped };
      if (!go.length || row.disabled || !c) continue;
      if (row.kind === 'market') await sendMarket(db, c, go, results[row.id], user);
      else await sendStore(db, c, go, results[row.id], user);
    }
    const after = await plan(env, db, { ids, channels: only.length ? only : null });
    return { results, ...after };
  });
}
async function sendMarket(db, c, go, res, user) {
  const items = go.map((x) => ({ id: x.id, key: x.key, name: x.name }));
  const t = Date.now();
  try {
    const r = await c.catalog.send(go.map((x) => x.payload));
    const row = await first(db, "INSERT INTO product_uploads (channel, ref, status, items, user, created_at) VALUES (?, ?, 'sent', ?, ?, ?) RETURNING id", c.id, r.ref, JSON.stringify(items), user.name, t);
    await markSent(db, c.id, go.map((x) => x.id), row && row.id, r.ref);
    await log(db, c.id, 'info', `${user.name}: ${go.length} ürün ${c.name} kanalına gönderildi (Kanallarda yayınla) · takip ${r.ref}`);
    Object.assign(res, { sent: go.length, ref: r.ref, upload: row && row.id });
  } catch (e) {
    if (e.budget) throw e;
    const msg = String(e.message || e).slice(0, 500);
    const row = await first(db, "INSERT INTO product_uploads (channel, status, items, error, user, created_at) VALUES (?, 'error', ?, ?, ?, ?) RETURNING id", c.id, JSON.stringify(items.map((x) => ({ ...x, ok: false, error: msg }))), msg, user.name, t);
    await markSent(db, c.id, go.map((x) => x.id), row && row.id, null, 'error', msg);
    await log(db, c.id, 'error', `Ürün gönderimi başarısız: ${msg}`);
    res.error = msg;
  }
}
// Site: aynı ana ürünün varyantları tek ürün olarak (varyantlı) açılır; ilan hemen panel ürününe bağlanır
async function sendStore(db, c, go, res, user) {
  const ids = go.map((x) => x.id);
  const rows = await allIn(db, ids, (ph, part) => [`SELECT * FROM products WHERE id IN (${ph})`, part]);
  const groups = new Map();
  for (const p of rows) { const g = groupCode(p) || 'p' + p.id; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(p); }
  for (const list of groups.values()) {
    list.sort((a, b) => String(a.variant_name || '').localeCompare(String(b.variant_name || ''), 'tr'));
    const t = Date.now(), items = list.map((p) => ({ id: p.id, key: p.sku || p.barcode || String(p.id), name: p.name }));
    try {
      const cm = str(list[0].category) && await first(db, 'SELECT remote_id FROM category_map WHERE local = ? AND channel = ?', list[0].category, c.id);
      const r = await c.createProduct(list[0], { ...(list.length > 1 ? { variants: list } : {}), ...(cm ? { categoryId: cm.remote_id } : {}) });
      const ls = (Array.isArray(r) ? r : [{ ...r, pid: r.pid || list[0].id }]).map((l, i) => ({ ...l, pid: l.pid || list[i].id }));
      const st = ls.map((l) => db.prepare(`INSERT INTO listings (channel, remote_id, product_id, remote_product_id, sku, barcode, name, price, remote_stock, pushed_stock, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (channel, remote_id) DO UPDATE SET product_id = excluded.product_id`).bind(c.id, String(l.remoteId), l.pid, l.remoteProductId || '', l.sku || '', l.barcode || '', l.name || '', num(l.price), l.stock ?? null, l.stock ?? null, t));
      await db.batch(st);
      const ref = ls[0].remoteProductId || ls[0].remoteId;
      const row = await first(db, "INSERT INTO product_uploads (channel, ref, status, items, user, created_at, checked_at) VALUES (?, ?, 'done', ?, ?, ?, ?) RETURNING id", c.id, String(ref), JSON.stringify(items.map((x) => ({ ...x, ok: true, status: 'oluşturuldu' }))), user.name, t, t);
      await markSent(db, c.id, ls.map((l) => l.pid), row && row.id, ref, 'live');
      res.live += ls.length;
    } catch (e) {
      if (e.budget) throw e;
      const msg = String(e.message || e).slice(0, 500);
      const row = await first(db, "INSERT INTO product_uploads (channel, status, items, error, user, created_at) VALUES (?, 'error', ?, ?, ?, ?) RETURNING id", c.id, JSON.stringify(items.map((x) => ({ ...x, ok: false, error: msg }))), msg, user.name, t);
      await markSent(db, c.id, list.map((p) => p.id), row && row.id, null, 'error', msg);
      await log(db, c.id, 'error', 'Ürün oluşturulamadı: ' + msg);
      res.error = msg;
    }
  }
  if (res.live) await log(db, c.id, 'info', `${user.name}: ${res.live} ürün ${c.name} sitesinde açıldı (Kanallarda yayınla)`);
}

// Durumlar: gönderilmiş ürünlerin sonucu kanaldan sorgulanır (en fazla 6 gönderim, gönderim başına 8 sn'de bir)
async function statusOf(env, db, ctx, ids) {
  if (!ids.length) return { items: [] };
  const rows = () => allIn(db, ids, (ph, part) => [`SELECT pc.product_id AS id, pc.channel, pc.state, pc.error, pc.ref, pc.updated_at AS at,
      EXISTS (SELECT 1 FROM listings l WHERE l.product_id = pc.product_id AND l.channel = pc.channel AND NOT ${HELD_SQL()}) AS listed FROM product_channel pc WHERE pc.product_id IN (${ph})`, part]);
  const now = Date.now();
  const ups = [...new Set((await allIn(db, ids, (ph, part) => [`SELECT DISTINCT upload_id FROM product_channel WHERE state = 'sent' AND upload_id IS NOT NULL AND product_id IN (${ph})`, part])).map((r) => r.upload_id))];
  if (ups.length) {
    const chans = await getChannels(env, db);
    for (const u of await allIn(db, ups, (ph, part) => [`SELECT * FROM product_uploads WHERE id IN (${ph}) AND status = 'sent' AND ref IS NOT NULL AND COALESCE(checked_at, 0) < ? ORDER BY COALESCE(checked_at, 0) LIMIT 6`, [...part, now - 8e3]])) {
      const c = chans.find((x) => x.id === u.channel && x.enabled && x.catalog && !x.hold);
      if (!c) continue;
      try { await checkUpload(env, db, ctx, u, c); } catch (e) { if (e.budget) break; await run(db, 'UPDATE product_uploads SET checked_at = ? WHERE id = ?', now, u.id); }
    }
  }
  return { items: (await rows()).map((r) => ({ ...r, state: r.listed ? 'live' : r.state, listed: !!r.listed })) };
}

export async function publishApi(env, db, ctx, path, m, q, b, user) {
  if (path === 'catalog/preflight' && m === 'GET') return plan(env, db, { ids: idsOf(q.ids), channels: listOf(q.channels).length ? listOf(q.channels) : null });
  if (path === 'catalog/preflight' && m === 'POST') return plan(env, db, { ids: idsOf(b.ids), channels: listOf(b.channels).length ? listOf(b.channels) : null, draft: b });
  if (path === 'catalog/publish' && m === 'POST') return publish(env, db, ctx, b, user);
  if (path === 'catalog/publish/status' && m === 'GET') return statusOf(env, db, ctx, idsOf(q.ids));
  if (path === 'catalog/brands' && m === 'GET') {
    const c = (await targets(env, db, [str(q.channel)]))[0];
    if (!c || !c.catalog) fail(404, 'Kanal yok');
    if (!c.catalog.brands) return { items: [] };
    return { items: await c.catalog.brands(str(q.q), str(q.category)) };
  }
  fail(404, 'Bilinmeyen işlem');
}
