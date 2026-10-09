// Kanal ürünleri: kanallardan çekilen ilanlar (Trendyol, Hepsiburada, ikas …) kanal kanal listelenir; firma panele almak
// istediklerini seçer. İlanlar zaten senkronla saklanır (listings), bu sayfa ek kayıt üretmez. "Panele ekle" ilanı aynı barkod /
// stok koduyla var olan ürüne bağlar, yoksa yeni ürün kartı açar. Kanal başına mod: otomatik (yeni ilan kendiliğinden ürün olur)
// ya da "ben seçeyim" (settings.manual_import, bkz. match.js → autoMatch).
import { all, first, run, getRaw, setSetting, getSettings, log } from './db.js';
import { autoMatch, relinkItems, normBc, normSku, manualImport, bestCandidates, approveConfident, score, prep } from './match.js';
import { fillProductInfo, catalogOf, applyDirtyStock } from './sync.js';
import { chunk, str, fail } from './util.js';

const STATES = {
  all: '1 = 1',
  unlinked: "l.product_id IS NULL AND l.ignored = 0 AND COALESCE(l.match, '') NOT LIKE 'dup:%'",
  // Aynı ürünün bu kanaldaki ikinci ilanı olabilir: kullanıcıya sorulur
  dup: "l.product_id IS NULL AND l.ignored = 0 AND l.match LIKE 'dup:%'",
  linked: 'l.product_id IS NOT NULL',
  ignored: "l.product_id IS NULL AND l.ignored = 1 AND COALESCE(l.match, '') != 'zero'",
  zero: "l.product_id IS NULL AND l.ignored = 1 AND l.match = 'zero'",
};
const filter = (channel, { state = 'all', q = '' } = {}) => {
  const where = ['l.channel = ?', STATES[state] || STATES.all], args = [channel];
  if (q) { const s = '%' + q + '%'; where.push('(l.name LIKE ? OR l.sku LIKE ? OR l.barcode LIKE ? OR l.remote_id = ?)'); args.push(s, s, s, q); }
  return { w: 'WHERE ' + where.join(' AND '), args };
};

// Kanal sekmeleri: bağlı her kanal (ilanı henüz gelmemiş olanlar dahil) ve ilan sayıları, panele alma modu
export async function channelSummary(db, channels = []) {
  const isManual = await manualImport(db);
  const [rows, settings] = await Promise.all([
    all(db, `SELECT channel, COUNT(*) AS total, SUM(product_id IS NOT NULL) AS linked, SUM(product_id IS NULL AND ignored = 0) AS unlinked,
      SUM(product_id IS NULL AND ignored = 0 AND match LIKE 'dup:%') AS dup, MAX(synced_at) AS synced_at FROM listings GROUP BY channel`),
    getSettings(db),
  ]);
  const cats = catalogOf(settings), have = new Set(rows.map((r) => r.channel));
  for (const c of channels) if (!have.has(c)) rows.push({ channel: c, total: 0, linked: 0, unlinked: 0, synced_at: null });
  return rows.map((r) => ({ ...r, linked: r.linked || 0, unlinked: r.unlinked || 0, dup: r.dup || 0, manual: isManual(r.channel), catalog: cats.includes(r.channel) }));
}

export async function listChannelProducts(db, q) {
  const channel = str(q.channel);
  if (!channel) fail(400, 'Kanal seçin');
  const limit = Math.min(Number(q.limit) || 50, 200), page = Math.max(1, Number(q.page) || 1);
  const f = filter(channel, { state: q.state, q: str(q.q).trim() });
  const [rows, total, counts] = await Promise.all([
    all(db, `SELECT l.channel, l.remote_id, l.remote_product_id, l.sku, l.barcode, l.name, l.group_name, l.variant_name, l.image, l.price, l.remote_stock, l.product_id, l.ignored, l.match, l.brand, l.category, l.synced_at,
        p.name AS product_name, p.variant_name AS product_variant, p.sku AS product_sku,
        d.id AS dup_id, d.name AS dup_name, d.variant_name AS dup_variant, d.sku AS dup_sku, d.barcode AS dup_barcode, d.image AS dup_image,
        (SELECT x.name FROM listings x WHERE x.product_id = d.id AND x.channel = l.channel LIMIT 1) AS dup_listing
      FROM listings l LEFT JOIN products p ON p.id = l.product_id
        LEFT JOIN products d ON l.product_id IS NULL AND l.match LIKE 'dup:%' AND d.id = CAST(substr(l.match, 5) AS INTEGER) ${f.w}
      ORDER BY COALESCE(NULLIF(l.group_name, ''), l.name) COLLATE NOCASE, l.variant_name COLLATE NOCASE LIMIT ? OFFSET ?`, ...f.args, limit, (page - 1) * limit),
    first(db, `SELECT COUNT(*) AS n FROM listings l ${f.w}`, ...f.args),
    first(db, `SELECT COUNT(*) AS total, SUM(${STATES.unlinked}) AS unlinked, SUM(${STATES.dup}) AS dup, SUM(${STATES.linked}) AS linked, SUM(${STATES.ignored}) AS ignored, SUM(${STATES.zero}) AS zero FROM listings l WHERE l.channel = ?`, channel),
  ]);
  // Panelde olmayan ilanlar için önerilen eşleşme (var olan ürün; kanalda boş olan)
  const sug = await bestCandidates(db, rows.filter((l) => !l.product_id && !l.dup_id));
  for (const l of rows) l.suggest = sug.get(l.remote_id) || null;
  return { listings: rows, total: total.n, page, limit, counts: Object.fromEntries(Object.entries(counts || {}).map(([k, v]) => [k, v || 0])) };
}

// Seçilen ilanları panele al: aynı barkod / stok koduyla ve bu kanaldan ilanı olmayan ürün varsa ona bağlanır,
// yoksa ilandan yeni ürün kartı açılır. all = filtredeki tüm eşleşmemiş ilanlar (en fazla 2000).
export async function addToPanel(env, db, b, user = {}) {
  const channel = str(b.channel);
  if (!channel) fail(400, 'Kanal seçin');
  let ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 2000) : [];
  if (b.all) {
    const f = filter(channel, { state: ['ignored', 'zero'].includes(b.state) ? b.state : 'unlinked', q: str(b.q).trim() });
    ids = (await all(db, `SELECT l.remote_id FROM listings l ${f.w} AND l.product_id IS NULL LIMIT 2000`, ...f.args)).map((r) => r.remote_id);
  }
  if (!ids.length) fail(400, 'Panele eklenecek ilan seçin');
  const ls = [];
  for (const part of chunk(ids, 300)) ls.push(...await all(db, `SELECT * FROM listings WHERE channel = ? AND product_id IS NULL AND remote_id IN (${part.map(() => '?').join(',')})`, channel, ...part));
  // Var olan ürünler (barkod / stok kodu) ve bu kanaldan zaten ilanı olanlar (bir ürüne her kanaldan tek ilan)
  const prods = await all(db, 'SELECT id, sku, barcode, name, variant_name FROM products');
  const pById = new Map(prods.map((p) => [p.id, p]));
  const taken = new Set((await all(db, 'SELECT product_id FROM listings WHERE channel = ? AND product_id IS NOT NULL', channel)).map((r) => r.product_id));
  const byBc = new Map(), bySku = new Map();
  for (const p of prods) { if (normBc(p.barcode)) byBc.set(normBc(p.barcode), p.id); if (normSku(p.sku)) bySku.set(normSku(p.sku), p.id); }
  const t = Date.now();
  let linked = 0, created = 0;
  const links = [], twins = [];
  const toCreate = [];
  for (const l of ls) {
    const hit = (normBc(l.barcode) && byBc.get(normBc(l.barcode))) || (normSku(l.sku) && bySku.get(normSku(l.sku)));
    if (hit && !taken.has(hit)) { links.push([hit, 'manual', l]); taken.add(hit); linked++; continue; }
    // Aynı barkod / stok kodlu ürünün bu kanalda zaten ilanı var: mükerrer ürün açılmaz, "aynı ürün mü?" diye sorulur
    const byBarcode = normBc(l.barcode) && byBc.get(normBc(l.barcode)) === hit, hp = pById.get(hit);
    const alike = byBarcode || (hp && score(prep({ name: l.name, variant: l.variant_name }), prep({ name: hp.name, variant: hp.variant_name })).score >= 70);
    if (hit && alike && l.match !== 'dup_no') { twins.push([hit, l]); continue; }
    toCreate.push(l);
  }
  // Yeni ürünler: 50'lik gruplar halinde (her grup tek veritabanı gidiş-dönüşü)
  for (const part of chunk(toCreate, 50)) {
    const res = await db.batch(part.map((l) => {
      // Stok kodu başka üründe varsa (ör. aynı kod iki ilanda) yeni ürün kodsuz açılır; çakışma olmaz
      const sku = normSku(l.sku) && !bySku.has(normSku(l.sku)) ? str(l.sku) : null;
      if (sku) bySku.set(normSku(sku), -1);
      return db.prepare(`INSERT INTO products (sku, barcode, name, group_name, variant_name, brand, category, image, images, sale_price, stock, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`).bind(sku, str(l.barcode) || null, l.name || l.sku || l.remote_id, l.group_name || null, l.variant_name || null,
        l.brand || null, l.category || null, l.image || '', l.images || null, l.price || 0, Math.max(0, l.remote_stock || 0), t, t);
    }));
    res.forEach((r, i) => { const id = r.results && r.results[0] && r.results[0].id; if (id) { links.push([id, 'new', part[i]]); created++; } });
  }
  for (const part of chunk(links, 90)) {
    await db.batch(part.map(([id, how, l]) => db.prepare('UPDATE listings SET product_id = ?, match = ?, ignored = 0, pushed_stock = remote_stock WHERE channel = ? AND remote_id = ? AND product_id IS NULL').bind(id, how, channel, l.remote_id)));
  }
  for (const part of chunk(twins, 90)) await db.batch(part.map(([id, l]) => db.prepare("UPDATE listings SET match = ? WHERE channel = ? AND remote_id = ? AND product_id IS NULL").bind('dup:' + id, channel, l.remote_id)));
  // Sipariş satırları yeni ürünlere bağlanır; diğer kanallardaki aynı ürünün ilanları kesin eşleşmeyle bağlanır
  await relinkItems(db);
  const settings = await getSettings(db);
  await applyDirtyStock(db, settings);
  const m = await autoMatch(db, { catalog: settings.catalog_channels || ['ikas1'] }).catch(() => ({ linked: 0 }));
  await fillProductInfo(db, settings).catch(() => {});
  await log(db, channel, 'info', `${user.name || 'Panel'}: kanal ürünlerinden panele alındı · ${created} yeni ürün, ${linked} var olan ürüne bağlandı${m.linked ? `, diğer kanallardan ${m.linked} ilan eşleşti` : ''}`);
  return { created, linked, twins: twins.length, others: m.linked || 0, skipped: ids.length - ls.length };
}

// Güçlü önerileri onayla: en iyi aday en az 85 puan ve ikinciden 15 puan öndeyse bağlar
export async function acceptStrong(db, b, user = {}) {
  const channel = str(b.channel);
  if (!channel) fail(400, 'Kanal seçin');
  const r = await approveConfident(db, { channel, min: 85, gap: 15 });
  if (r.linked) { await relinkItems(db); await applyDirtyStock(db); await log(db, channel, 'info', `${user.name || 'Panel'}: ${r.linked} güçlü eşleşme önerisi onaylandı`); }
  return r;
}

export async function ignoreListings(db, b) {
  const channel = str(b.channel), ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 2000) : [];
  if (!channel || !ids.length) fail(400, 'İlan seçin');
  const on = b.ignored !== false;
  let n = 0;
  for (const part of chunk(ids, 300)) {
    const r = await run(db, `UPDATE listings SET ignored = ?, match = ? WHERE channel = ? AND product_id IS NULL AND remote_id IN (${part.map(() => '?').join(',')})`, on ? 1 : 0, on ? 'ignored' : null, channel, ...part);
    n += (r.meta && r.meta.changes) || 0;
  }
  return { changed: n };
}

// Tekrar olabilir ilanlara karar: same = aynı ürün (ilan o ürüne de bağlanır; ürünün bu kanalda iki ilanı olur, stok ikisine de gider),
// aksi halde farklı ürün (ilandan yeni ürün kartı açılır ve bir daha sorulmaz)
export async function resolveTwins(env, db, b, user = {}) {
  const channel = str(b.channel), ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 500);
  if (!channel || !ids.length) fail(400, 'İlan seçin');
  const ls = [];
  for (const part of chunk(ids, 300)) ls.push(...await all(db, `SELECT remote_id, match FROM listings WHERE channel = ? AND product_id IS NULL AND match LIKE 'dup:%' AND remote_id IN (${part.map(() => '?').join(',')})`, channel, ...part));
  if (!ls.length) fail(400, 'Seçilen ilanlar artık beklemiyor; sayfayı yenileyin');
  if (b.same) {
    for (const part of chunk(ls, 90)) await db.batch(part.map((l) => db.prepare("UPDATE listings SET product_id = ?, match = 'dup_ok', ignored = 0, pushed_stock = remote_stock WHERE channel = ? AND remote_id = ? AND product_id IS NULL").bind(Number(l.match.slice(4)), channel, l.remote_id)));
    await relinkItems(db);
    await log(db, channel, 'info', `${user.name || 'Panel'}: ${ls.length} ilan aynı ürünün ikinci ilanı olarak bağlandı`);
    return { linked: ls.length };
  }
  for (const part of chunk(ls, 90)) await db.batch(part.map((l) => db.prepare("UPDATE listings SET match = 'dup_no' WHERE channel = ? AND remote_id = ?").bind(channel, l.remote_id)));
  return addToPanel(env, db, { channel, ids: ls.map((l) => l.remote_id) }, user);
}

// Kanal modu: manual = true → "ben seçeyim"
export async function setMode(db, b) {
  const channel = str(b.channel);
  if (!/^[a-z0-9_]+$/.test(channel)) fail(400, 'Geçersiz kanal');
  const m = (await getRaw(db, 'manual_import')) || {};
  m[channel] = !!b.manual;
  await setSetting(db, 'manual_import', m);
  return { ok: true, manual: m[channel] };
}
