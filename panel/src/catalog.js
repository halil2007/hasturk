// Kategori eşleştirme ve pazaryerine ürün yükleme ("Ürün yükle" ekranı).
// Panel ürünlerinin kategorisi ana katalog sitesinden (ikas) gelir. Her ikas kategorisi, her pazaryeri için bir kategoriye
// ve o kategorinin özellik değerlerine (ör. Menşei = TR, Ağırlık = ürünün varyant adından) bir kez eşlenir.
// Yükleme: henüz o kanalda ilanı olmayan ürünler, eşleştirmedeki değerlerle kanalın ürün servisine gönderilir; kanalın
// verdiği takip kimliğiyle (HB trackingId / Trendyol batchRequestId) sonuç sorgulanır. Onaylanan ürün, ilanlar
// çekilince barkod / SKU ile otomatik eşleşir.
import { all, first, run, getRaw, setSetting, getSettings, log } from './db.js';
import { getChannels } from './channels/index.js';
import { importListings, catalogOf } from './sync.js';
import { fail, str, num, r2 } from './util.js';

const NO_API = { idefix: 'idefix ürün aktarma servisi dokümanı gelince eklenecek', pttavm: 'PttAVM ürün aktarma servisi dokümanı gelince eklenecek', n11: 'N11 ürün servisi dokümanı gelince eklenecek', pazarama: 'Pazarama ürün servisi dokümanı gelince eklenecek' };
const norm = (s) => String(s || '').toLocaleLowerCase('tr').replace(/,/g, '.').replace(/\s+/g, '').replace(/(lt|litre|l)$/, 'lt').replace(/(kg|kilo|kilogram)$/, 'kg');

async function targets(env, db) {
  return (await getChannels(env, db)).filter((c) => c.type !== 'ikas' && (c.enabled || NO_API[c.id] && !c.paused));
}
async function target(env, db, id) {
  const c = (await getChannels(env, db)).find((x) => x.id === id);
  if (!c) fail(404, 'Kanal yok');
  if (c.hold) fail(400, `${c.name} beklemede: yazma işlemleri kapalı`);
  if (!c.enabled || !c.catalog) fail(400, NO_API[c.id] || `${c.name} için ürün yükleme desteklenmiyor ya da API bilgileri girilmemiş`);
  return c;
}
const mapOf = async (db, local, ch) => {
  const m = await first(db, 'SELECT * FROM category_map WHERE local = ? AND channel = ?', local, ch);
  return m && { ...m, attrs: JSON.parse(m.attrs || '{}') };
};

// Panel ürünü → kanala gidecek ortak ürün bilgisi
async function productsFor(db, settings, { local, ch, ids }) {
  const cats = catalogOf(settings);
  const ph = cats.map(() => '?').join(',');
  const where = ids ? `p.id IN (${ids.map(() => '?').join(',')})` : "COALESCE(p.category, '') = ?";
  return all(db, `SELECT p.*, (SELECT MAX(l.price) FROM listings l WHERE l.product_id = p.id AND l.channel IN (${ph})) AS cat_price,
      (SELECT MAX(l.list_price) FROM listings l WHERE l.product_id = p.id AND l.channel IN (${ph})) AS cat_list,
      EXISTS (SELECT 1 FROM listings l WHERE l.product_id = p.id AND l.channel = ?) AS listed
    FROM products p WHERE p.active = 1 AND ${where} ORDER BY COALESCE(NULLIF(p.group_name, ''), p.name), p.variant_name LIMIT 500`,
  ...cats, ...cats, ch, ...(ids || [local]));
}
function shape(p, opts, zeroStock) {
  const base = p.cat_price > 0 ? p.cat_price : p.sale_price;
  const k = 1 + num(opts.markup) / 100;
  const img = str(p.image).replace(/\/(180|360)\//, '/1080/');
  return {
    id: p.id, sku: str(p.sku), barcode: str(p.barcode), name: str(p.name), brand: str(p.brand), description: str(p.description) || str(p.name),
    image: img, images: img ? [img] : [], vat: p.vat ?? 20, desi: p.desi || 1, stock: zeroStock ? 0 : Math.max(0, Math.round(p.stock || 0)),
    price: r2(base * k), listPrice: r2(Math.max(p.cat_list || 0, base) * k),
    group: str(p.parent_key).split(':').pop() || str(p.sku), variant: str(p.variant_name),
  };
}
// Varyant adından (ör. "5 Kg") kanalın değer listesindeki karşılığını bul
function picker(c, catId) {
  const cache = new Map();
  return async (attr, text) => {
    if (!text) return null;
    if (!cache.has(attr.id)) cache.set(attr.id, await c.catalog.values(catId, attr.id).catch(() => []));
    const list = cache.get(attr.id), t = norm(text);
    return list.find((v) => norm(v.value) === t) || list.find((v) => t.includes(norm(v.value)) && norm(v.value).length > 1) || null;
  };
}
async function buildAll(c, map, prods, opts, zeroStock) {
  const pick = picker(c, map.remote_id), out = [];
  for (const p of prods) {
    const pr = shape(p, opts, zeroStock);
    try { out.push({ p: pr, ...(await c.catalog.build(pr, map, { opts, pick })) }); }
    catch (e) { out.push({ p: pr, key: pr.barcode || pr.sku, missing: ['hata: ' + e.message] }); }
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
    const maps = await all(db, 'SELECT local, channel, remote_id, remote_name, attrs, updated_at FROM category_map');
    return {
      channels: chans.map((c) => ({ id: c.id, name: c.name, ready: !!(c.enabled && c.catalog && !c.hold), demo: !!c.demo, sandbox: !!c.sandbox,
        reason: c.hold ? 'Beklemede' : !c.catalog ? NO_API[c.id] || 'Desteklenmiyor' : '', options: (c.catalog && c.catalog.options) || [], opts: allOpts[c.id] || {} })),
      categories: rows.map((r) => ({ local: r.local, n: r.n, listed: Object.fromEntries(chans.map((c) => [c.id, r['l_' + c.id] || 0])) })),
      maps: maps.map((x) => ({ ...x, attrs: JSON.parse(x.attrs || '{}') })),
      uploads: (await all(db, 'SELECT id, channel, ref, status, items, result, error, user, created_at, checked_at FROM product_uploads ORDER BY id DESC LIMIT 30'))
        .map((u) => ({ ...u, items: JSON.parse(u.items || '[]'), result: JSON.parse(u.result || 'null') })),
      stockSync: !!settings.stock_sync,
    };
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
    return { ok: true };
  }
  if (path === 'catalog/unmap' && m === 'POST') { await run(db, 'DELETE FROM category_map WHERE local = ? AND channel = ?', str(b.local), str(b.channel)); return { ok: true }; }
  if (path === 'catalog/options' && m === 'POST') {
    const c = await target(env, db, str(b.channel));
    const o = {};
    for (const x of [...(c.catalog.options || []), { k: 'markup' }]) if (b.opts && str(b.opts[x.k]) !== '') o[x.k] = str(b.opts[x.k]);
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
    const built = map ? await buildAll(c, map, open, allOpts[c.id] || {}, !!Number(q.zero)) : [];
    const byId = new Map(built.map((x) => [x.p.id, x]));
    return {
      map, listed: prods.length - open.length,
      items: open.map((p) => { const x = byId.get(p.id); const s = x ? x.p : shape(p, allOpts[c.id] || {}, !!Number(q.zero));
        return { id: p.id, name: s.name, sku: s.sku, barcode: s.barcode, image: p.image, price: s.price, stock: s.stock, variant: s.variant, missing: x ? x.missing : ['kategori eşleştirilmemiş'], sent: sent.has(p.id) }; }),
    };
  }
  if (path === 'catalog/upload' && m === 'POST') {
    const c = await target(env, db, str(b.channel));
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Boolean);
    if (!ids.length) fail(400, 'Ürün seçin');
    const prods = (await productsFor(db, settings, { ch: c.id, ids })).filter((p) => !p.listed);
    const groups = new Map();
    for (const p of prods) { const k = str(p.category); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
    const ready = [], skipped = [];
    for (const [local, list] of groups) {
      const map = await mapOf(db, local, c.id);
      if (!map) { skipped.push(...list.map((p) => ({ id: p.id, name: p.name, missing: ['kategori eşleştirilmemiş'] }))); continue; }
      for (const x of await buildAll(c, map, list, allOpts[c.id] || {}, !!b.zeroStock)) (x.missing.length ? skipped.push({ id: x.p.id, name: x.p.name, missing: x.missing }) : ready.push(x));
    }
    if (!ready.length) return { sent: 0, skipped };
    const items = ready.map((x) => ({ id: x.p.id, key: x.key, name: x.p.name }));
    const t = Date.now();
    try {
      const r = await c.catalog.send(ready.map((x) => x.payload));
      const row = await first(db, "INSERT INTO product_uploads (channel, ref, status, items, user, created_at) VALUES (?, ?, 'sent', ?, ?, ?) RETURNING id", c.id, r.ref, JSON.stringify(items), user.name, t);
      await log(db, c.id, 'info', `${user.name}: ${ready.length} ürün ${c.name}'a gönderildi · takip ${r.ref}`);
      return { id: row && row.id, ref: r.ref, sent: ready.length, skipped };
    } catch (e) {
      await run(db, "INSERT INTO product_uploads (channel, status, items, error, user, created_at) VALUES (?, 'error', ?, ?, ?, ?)", c.id, JSON.stringify(items), e.message.slice(0, 2000), user.name, t);
      await log(db, c.id, 'error', `Ürün gönderimi başarısız: ${e.message}`);
      fail(502, `${c.name} ürünleri kabul etmedi: ${e.message}`);
    }
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
async function checkUpload(env, db, ctx, u, c) {
  const st = await c.catalog.status(u.ref);
  const res = new Map(st.items.map((x) => [x.key, x]));
  const items = JSON.parse(u.items || '[]').map((x) => { const r = res.get(x.key); return r ? { ...x, ok: r.ok, status: r.status, error: r.error } : x; });
  const status = st.done ? 'done' : 'sent';
  await run(db, 'UPDATE product_uploads SET status = ?, items = ?, result = ?, checked_at = ? WHERE id = ?', status, JSON.stringify(items), JSON.stringify(st.items.slice(0, 500)), Date.now(), u.id);
  if (st.done) {
    const ok = items.filter((x) => x.ok).length, bad = items.filter((x) => x.ok === false).length;
    await log(db, c.id, bad ? 'error' : 'info', `Ürün gönderimi #${u.id} tamamlandı: ${ok} onay${bad ? `, ${bad} hata (${items.filter((x) => x.ok === false).slice(0, 2).map((x) => `${x.name}: ${x.error || x.status}`).join(' · ')})` : ''}`);
    if (ok) {
      const job = importListings(env, db, { only: [c.id] }).catch(() => {});
      if (ctx && ctx.waitUntil) ctx.waitUntil(job); else await job;
    }
  }
  return { status, items, done: st.done };
}
// Senkron sırasında: son 4 saatte gönderilip sonucu henüz alınmamış gönderimler sorgulanır (Trendyol sonucu 4 saat saklar)
export async function checkPendingUploads(env, db) {
  const rows = await all(db, "SELECT * FROM product_uploads WHERE status = 'sent' AND ref IS NOT NULL AND created_at BETWEEN ? AND ? ORDER BY id LIMIT 5", Date.now() - 4 * 3600e3, Date.now() - 60e3);
  let n = 0;
  for (const u of rows) {
    const c = (await getChannels(env, db)).find((x) => x.id === u.channel && x.enabled && x.catalog && !x.hold);
    if (!c) continue;
    try { if ((await checkUpload(env, db, null, u, c)).done) n++; } catch (e) { await log(db, u.channel, 'error', `Ürün gönderimi #${u.id} sorgulanamadı: ${e.message}`); }
  }
  return n;
}
