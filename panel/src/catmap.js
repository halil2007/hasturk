// Kategori eşleştirme ekranı: satırlar panel kategorileri, sütunlar kategori ağacı olan tüm bağlı kanallar (pazaryerleri: catalog;
// siteler: storeCategories — ikas kategorileri, WooCommerce kategorileri). Onaylanan eşleşmeler category_map'e (Ürün yükle / Kanallarda
// yayınla / otomatik gönderimle aynı kayıt) yazılır; öneriler category_suggest'te (sure = kesin).
//   GET  catalog/matrix                       tablo + özet (% eşleşen) + zorunlu özellik eksikleri
//   POST catalog/automap-all {redo, since}    tüm kategori × kanal için öneri (parça parça; "remaining" 0 olana kadar tekrar çağrılır)
//   POST catalog/approve-sure {channels}      kesin önerileri onayla (parça parça)
//   POST catalog/cell {local, channel, remote_id, remote_name | reject}
//   GET  catalog/store-categories?channel=&q=
import { all, first, run, getSettings, getRaw, setSetting, log } from './db.js';
import { getChannels } from './channels/index.js';
import { rank, facetClash } from './catmatch.js';
import { autoAttrs, namesOf, confident, originOf, clearSuggest, rejectMapped, staleNotice, STALE_MSG } from './catalog.js';
import { fail, str, isImageAttr } from './util.js';

const STEP = 60, APPROVE_STEP = 40, ATTR_CATS = 40;
const lc = (s) => str(s).toLocaleLowerCase('tr').replace(/\s+/g, ' ');
const leaf = (s) => lc(String(s || '').split(/›|>/).pop());
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

export async function columns(env, db) {
  return (await getChannels(env, db)).filter((c) => !c.paused && c.enabled && !c.hold && (c.catalog || c.storeCategories))
    .map((c) => ({ c, id: c.id, name: c.name, kind: c.catalog ? 'market' : 'store' }));
}
const catCache = new WeakMap();
async function catsOf(col) {
  const c = col.c;
  if (c.catalog) return c.catalog.allCategories ? c.catalog.allCategories() : [];
  const hit = catCache.get(c);
  if (hit && Date.now() - hit.at < 3600e3) return hit.list;
  const list = await c.storeCategories();
  catCache.set(c, { at: Date.now(), list });
  return list;
}
async function locals(db) {
  return all(db, "SELECT category AS local, COUNT(*) AS n FROM products WHERE active = 1 AND TRIM(COALESCE(category, '')) != '' GROUP BY category ORDER BY category COLLATE NOCASE");
}

// Bir kategori × kanal için öneri: sitede aynı adlı kategori (tam yol aynıysa ya da tek aynı adlı kategori varsa ve cinsiyet / yaş …
// çelişmiyorsa kesin); diğerleri puanlamayla (catmatch.js), reddedilenler hariç. Kullanıcının daha önce reddettiği / kaldırdığı bir
// eşleşme varsa yeni öneri "kesin" sayılmaz (otomatik onaylanmaz; kullanıcı bakar).
async function suggestOne(db, col, local, list, prev) {
  const rej = new Set(parse(prev && prev.rejected, []).map(String));
  let best = null, sure = false;
  const names = await namesOf(db, local);
  if (col.kind === 'store') {
    const same = list.filter((x) => !rej.has(String(x.id)) && lc(x.name) === leaf(local));
    if (same.length) {
      const full = (x) => lc(x.path ? `${x.path} › ${x.name}` : x.name);
      best = same.find((x) => full(x) === lc(local)) || same[0];
      sure = full(best) === lc(local) || (same.length === 1 && !facetClash(local, names, best));
      best = { ...best, score: 10 };
    }
  }
  if (!best) {
    const r = rank(list, local, names, 5 + rej.size).filter((x) => !rej.has(String(x.id)));
    if (r[0] && r[0].score >= 2) { best = r[0]; sure = confident(r); }
  }
  if (rej.size) sure = false;
  await run(db, `INSERT INTO category_suggest (local, channel, remote_id, remote_name, path, score, sure, rejected, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (local, channel) DO UPDATE SET remote_id = excluded.remote_id, remote_name = excluded.remote_name, path = excluded.path, score = excluded.score, sure = excluded.sure, created_at = excluded.created_at`,
  local, col.id, best ? String(best.id) : null, best ? best.name : null, best ? best.path || '' : null, best ? best.score : null, sure ? 1 : 0, JSON.stringify([...rej]), Date.now());
  return best ? { sure } : null;
}

// Tüm kategori × kanal önerileri, parça parça (istek başına en fazla STEP çift; kanal kategori ağacı bir kez okunur).
// Kaldığı yerden devam eder: önerisi olan çift atlanır (redo: bu turda — since'ten sonra — işlenmemiş olanlar yeniden).
export async function automapAll(env, db, { redo = false, since = Date.now(), only = null, limit = STEP } = {}) {
  const cols = (await columns(env, db)).filter((x) => !only || only.includes(x.id)), locs = (await locals(db)).map((r) => r.local);
  let processed = 0, remaining = 0, sure = 0, suggested = 0;
  const errors = [];
  for (const col of cols) {
    const maps = new Set((await all(db, 'SELECT local FROM category_map WHERE channel = ?', col.id)).map((r) => r.local));
    const sugs = new Map((await all(db, 'SELECT local, rejected, created_at FROM category_suggest WHERE channel = ?', col.id)).map((r) => [r.local, r]));
    // created_at = 0: eşleşmesi kaldırıldı, yeni öneri bekliyor
    const todo = locs.filter((l) => !maps.has(l) && (!sugs.has(l) || !sugs.get(l).created_at || (redo && sugs.get(l).created_at < since)));
    if (!todo.length) continue;
    if (processed >= limit) { remaining += todo.length; continue; }
    let list;
    try { list = await catsOf(col); } catch (e) { if (e.budget) throw e; errors.push(`${col.name}: ${e.message}`); continue; }
    for (const l of todo) {
      if (processed >= limit) { remaining++; continue; }
      const r = await suggestOne(db, col, l, list, sugs.get(l));
      processed++;
      if (r) { suggested++; if (r.sure) sure++; }
    }
  }
  return { processed, remaining, suggested, sure, since, errors };
}

async function saveMap(db, col, local, remote, name, user, keep = true) {
  const cur = await first(db, 'SELECT remote_id, attrs FROM category_map WHERE local = ? AND channel = ?', local, col.id);
  let attrs = cur && keep && String(cur.remote_id) === String(remote) ? parse(cur.attrs, {}) : null;
  if (!attrs) attrs = col.kind === 'market' ? (await autoAttrs(col.c, String(remote), { origin: originOf(await getSettings(db)) }).catch(() => ({ attrs: {} }))).attrs : {};
  await run(db, `INSERT INTO category_map (local, channel, remote_id, remote_name, attrs, updated_at, user) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (local, channel) DO UPDATE SET remote_id = excluded.remote_id, remote_name = excluded.remote_name, attrs = excluded.attrs, updated_at = excluded.updated_at, user = excluded.user`,
  local, col.id, String(remote), str(name), JSON.stringify(attrs), Date.now(), user);
  await clearSuggest(db, local, col.id); // reddedilenler kalır
}
// Kesin önerileri onayla (istek başına en fazla APPROVE_STEP; pazaryerinde zorunlu özellikler mümkün olduğunca otomatik doldurulur)
export async function approveSure(env, db, { only = null, user = 'Otomatik (kesin)', limit = APPROVE_STEP } = {}) {
  const cols = (await columns(env, db)).filter((x) => !only || only.includes(x.id));
  let approved = 0, remaining = 0;
  for (const col of cols) {
    const rows = await all(db, `SELECT s.local, s.remote_id, s.remote_name FROM category_suggest s WHERE s.channel = ? AND s.sure = 1 AND s.remote_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM category_map m WHERE m.local = s.local AND m.channel = s.channel)`, col.id);
    for (const r of rows) {
      if (approved >= limit) { remaining++; continue; }
      await saveMap(db, col, r.local, r.remote_id, r.remote_name, user);
      approved++;
    }
  }
  return { approved, remaining };
}

// Eşleşmiş kategoride doldurulmamış zorunlu özellik sayısı (görsel ve varyant özellikleri üründen gelir)
async function missingAttrs(c, m) {
  const attrs = parse(m.attrs, {});
  const list = await c.catalog.attributes(m.remote_id);
  return list.filter((a) => a.mandatory && a.kind !== 'variant' && !isImageAttr(a) && !(attrs[a.id] && (str(attrs[a.id].value) || str(attrs[a.id].id)))).map((a) => a.name);
}

export async function matrix(env, db) {
  const cols = await columns(env, db), locs = await locals(db), settings = await getSettings(db);
  const maps = await all(db, 'SELECT local, channel, remote_id, remote_name, attrs FROM category_map');
  const sugs = await all(db, 'SELECT local, channel, remote_id, remote_name, path, sure FROM category_suggest');
  const cells = {};
  for (const l of locs) cells[l.local] = {};
  const ids = new Set(cols.map((x) => x.id));
  for (const s of sugs) if (cells[s.local] && ids.has(s.channel)) cells[s.local][s.channel] = s.remote_id ? { state: 'suggested', remote_id: s.remote_id, name: s.remote_name, path: s.path || '', sure: !!s.sure } : { state: 'none', tried: true };
  const attrBudget = new Map(), trees = new Map(), stale = new Map();
  // Kanal ağacında artık olmayan eşleşmeler ("stale"): ağaç okunamazsa işaretlenmez
  const treeOf = async (col) => {
    if (!trees.has(col.id)) {
      let set = null;
      try { const list = await catsOf(col); if (list && list.length) set = new Set(list.map((x) => String(x.id))); } catch (e) { if (e.budget) throw e; }
      trees.set(col.id, set);
    }
    return trees.get(col.id);
  };
  for (const m of maps) {
    if (!cells[m.local] || !ids.has(m.channel)) continue;
    const col = cols.find((x) => x.id === m.channel), cell = { state: 'mapped', remote_id: m.remote_id, name: m.remote_name, missing: null };
    const tree = await treeOf(col);
    if (tree && !tree.has(String(m.remote_id))) {
      cells[m.local][m.channel] = { ...cell, state: 'stale', note: STALE_MSG };
      (stale.get(col.id) || stale.set(col.id, []).get(col.id)).push(m.local);
      continue;
    }
    if (col.kind === 'market') {
      const used = attrBudget.get(col.id) || new Set();
      if (used.has(m.remote_id) || used.size < ATTR_CATS) {
        used.add(m.remote_id); attrBudget.set(col.id, used);
        try { cell.missing = await missingAttrs(col.c, m); } catch (e) { if (e.budget) throw e; }
      }
    }
    cells[m.local][m.channel] = cell;
  }
  for (const col of cols) if (trees.get(col.id)) await staleNotice(db, col, stale.get(col.id) || []).catch(() => {});
  const summary = cols.map((col) => {
    const mapped = locs.filter((l) => (cells[l.local][col.id] || {}).state === 'mapped').length;
    const sure = locs.filter((l) => (cells[l.local][col.id] || {}).sure).length;
    return { id: col.id, mapped, sure, stale: (stale.get(col.id) || []).length, pct: locs.length ? Math.round((mapped / locs.length) * 100) : 0 };
  });
  const todo = cols.reduce((n, col) => n + locs.filter((l) => !cells[l.local][col.id]).length, 0);
  return { channels: cols.map(({ id, name, kind }) => ({ id, name, kind })), locals: locs, cells, summary, todo, autoSure: !!settings.auto_approve_sure };
}

// Arka planda (günde bir, kanal başına): yeni kanal / yeni kategoriler için öneri hazırlanır. Ayarlarda "Kesin eşleşmeleri otomatik
// onayla" açıksa yalnız kesin öneriler onaylanır; diğerleri her zaman kullanıcı onayı bekler.
export async function autoSuggest(env, db, settings) {
  settings = settings || await getSettings(db);
  const out = {};
  for (const col of await columns(env, db)) {
    const k = 'automap2:' + col.id, last = await getRaw(db, k);
    if (last && Date.now() - last < 864e5) continue;
    try {
      const r = await automapAll(env, db, { only: [col.id], limit: 100 });
      if (!r.remaining) await setSetting(db, k, Date.now());
      out[col.id] = r.suggested;
    } catch (e) { if (e.budget) throw e; out[col.id] = 'hata: ' + e.message; }
  }
  if (settings.auto_approve_sure) {
    const a = await approveSure(env, db, {});
    if (a.approved) await log(db, null, 'info', `${a.approved} kesin kategori eşleşmesi otomatik onaylandı`);
    out.approved = a.approved;
  }
  return out;
}

export async function catmapApi(env, db, ctx, path, m, q, b, user) {
  if (path === 'catalog/matrix' && m === 'GET') return matrix(env, db);
  if (path === 'catalog/automap-all' && m === 'POST') return automapAll(env, db, { redo: !!b.redo, since: Number(b.since) || Date.now(), only: Array.isArray(b.channels) && b.channels.length ? b.channels : null });
  if (path === 'catalog/approve-sure' && m === 'POST') {
    const r = await approveSure(env, db, { only: Array.isArray(b.channels) && b.channels.length ? b.channels : null, user: user.name + ' (kesin)' });
    if (r.approved) await log(db, null, 'info', `${user.name}: ${r.approved} kesin kategori eşleşmesi onaylandı`);
    return r;
  }
  if (path === 'catalog/cell' && m === 'POST') {
    const col = (await columns(env, db)).find((x) => x.id === str(b.channel));
    if (!col) fail(404, 'Kanal yok');
    const local = str(b.local);
    if (!local) fail(400, 'Kategori seçin');
    if (b.reject) {
      const sg = await first(db, 'SELECT remote_id, rejected FROM category_suggest WHERE local = ? AND channel = ?', local, col.id);
      if (sg && sg.remote_id) await run(db, 'UPDATE category_suggest SET rejected = ?, remote_id = NULL, remote_name = NULL, path = NULL, sure = 0 WHERE local = ? AND channel = ?', JSON.stringify([...new Set([...parse(sg.rejected, []), sg.remote_id])]), local, col.id);
      return { ok: true };
    }
    if (!str(b.remote_id)) fail(400, 'Kanal kategorisi seçin');
    const cur = await first(db, 'SELECT remote_id FROM category_map WHERE local = ? AND channel = ?', local, col.id);
    if (cur && String(cur.remote_id) !== str(b.remote_id)) await rejectMapped(db, local, col.id, cur.remote_id, { fresh: false });
    await saveMap(db, col, local, str(b.remote_id), str(b.remote_name), user.name);
    return { ok: true };
  }
  if (path === 'catalog/store-categories' && m === 'GET') {
    const col = (await columns(env, db)).find((x) => x.id === str(q.channel) && x.kind === 'store');
    if (!col) fail(404, 'Kanal yok');
    const k = lc(q.q);
    const list = await catsOf(col);
    return { total: list.length, items: list.filter((x) => !k || lc(`${x.name} ${x.path || ''}`).includes(k)).slice(0, 60) };
  }
  fail(404, 'Bilinmeyen işlem');
}
