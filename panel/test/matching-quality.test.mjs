// Eşleştirme kalitesi (tüm sektörler): ürün ↔ ilan kesin eşleşmesi, sipariş satırı çözümü, kategori önerisinin "kesin" bayrağı,
// eşleşme yaşam döngüsü (kaldırılan eşleşme geri gelmez, kanalda silinen kategori / ilan) ve çok eksenli varyant özellikleri.
// Yanlış bağlama sessizdir (stok yanlış ilana gider); bu yüzden emin olunamayan durumda bağlanmaz, kullanıcıya bırakılır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, first, all, setSetting } from '../src/db.js';
import { autoMatch, approveConfident, relinkItems, quantities, fullKey, variantKey, skuEq, normBc } from '../src/match.js';
import { productMaps, refreshListings } from '../src/sync.js';
import { rank } from '../src/catmatch.js';
import { confident, picker } from '../src/catalog.js';
import { resetChannels } from '../src/channels/index.js';
import { n11 } from '../src/channels/n11.js';
import { autoSuggest } from '../src/catmap.js';
import worker from '../src/index.js';

// Mini katalog: panel ürünleri ana katalogdan (ikas1) gelir; diğer kanalların ilanları autoMatch ile bağlanır
async function world(prods, listings) {
  const db = d1(); await init(db);
  const ids = {}, t = Date.now();
  for (const p of prods) {
    const name = p.variant ? `${p.group} - ${p.variant}` : p.group;
    ids[p.k] = (await db.prepare('INSERT INTO products (sku, barcode, name, group_name, variant_name, parent_key, stock, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 5, 1, ?, ?) RETURNING id')
      .bind(p.sku || null, p.bc || null, name, p.group, p.variant || null, 'ikas1:' + (p.g || p.group), t, t).first()).id;
    await db.prepare("INSERT INTO listings (channel, remote_id, remote_product_id, product_id, sku, barcode, name, group_name, variant_name, price, remote_stock, match) VALUES ('ikas1', ?, ?, ?, ?, ?, ?, ?, ?, 10, 5, 'new')")
      .bind('ik-' + p.k, p.g || p.group, ids[p.k], p.sku || '', p.bc || '', name, p.group, p.variant || '').run();
  }
  for (const l of listings) {
    await db.prepare('INSERT INTO listings (channel, remote_id, remote_product_id, sku, barcode, name, group_name, variant_name, price, remote_stock, match) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 10, 5, ?)')
      .bind(l.ch || 'trendyol', l.rid, 'r-' + l.rid, l.sku || '', l.bc || '', l.name, l.name, l.variant || '', l.match ? l.match.replace(/^x:(\w)$/, (_, k) => 'x:' + ids[k]) : null).run();
  }
  const linkOf = async (rid, ch = 'trendyol') => {
    const r = await first(db, 'SELECT product_id FROM listings WHERE channel = ? AND remote_id = ?', ch, rid);
    return Object.keys(ids).find((k) => ids[k] === r.product_id) || null;
  };
  return { db, ids, linkOf };
}
const P = (k, group, variant, sku, bc, g) => ({ k, group, variant, sku, bc, g });

test('barkod kardeş varyanttan / tekli üründen kopyalanmışsa (çoklu paket, başka ölçü) yanlış ürüne bağlanmaz', async () => {
  const w = await world([P('A', 'Maden Suyu 200 ml', '', null, '8690000000011'), P('B', "Maden Suyu 200 ml 6'lı", '', null, '8690000000028'),
    P('C', 'Solucan Gübresi', '5 Kg', null, '8691000000051', 'g1'), P('D', 'Solucan Gübresi', '10 Kg', null, '8691000000101', 'g1')],
  [{ rid: 't1', name: "Maden Suyu 200 ml 6'lı Paket", bc: '8690000000011' }, { rid: 't2', name: 'Solucan Gübresi 10 Kg', bc: '8691000000051' }]);
  await autoMatch(w.db);
  assert.notEqual(await w.linkOf('t1'), 'A');
  assert.notEqual(await w.linkOf('t2'), 'C');
});

test('aynı barkodu taşıyan varyantlar: tam ad + varyant (sırası farklı da olsa) karar verir', async () => {
  const w = await world([P('A', 'Basic Tişört', 'Siyah / S', null, '8692000000011', 'g1'), P('B', 'Basic Tişört', 'Siyah / M', null, '8692000000011', 'g1'),
    P('E', 'Kadın Midi Elbise', 'Kırmızı / M', null, null, 'g2'), P('F', 'Kadın Midi Elbise', 'Kırmızı / L', null, null, 'g2')],
  [{ rid: 't1', name: 'Basic Tişört', variant: 'Siyah / M', bc: '8692000000011' }, { rid: 't2', name: 'Kadın Midi Elbise', variant: 'M / Kırmızı' }]);
  await autoMatch(w.db);
  assert.equal(await w.linkOf('t1'), 'B');
  assert.equal(await w.linkOf('t2'), 'E');
  assert.equal(variantKey('Kadın Elbise', 'Kırmızı / M'), variantKey('Kadın Elbise', 'M / Kırmızı'));
});

test('zayıf stok kodu (kısa / sayısal, başka kanalın numarası) ve ayraç konumu farklı kod tek başına bağlamaz', async () => {
  const w = await world([P('A', "Bebek Body 3'lü Paket", '', '12', null), P('B', 'Oversize Tişört', 'Beyaz / XS', 'TSH-1-12', null), P('C', 'USB-C Şarj Kablosu 1 m', '', 'abc_123', null)],
  [{ rid: 't1', ch: 'hepsiburada', name: 'Kedi Tırmalama Tahtası 60 cm', sku: '12', bc: '8694000000011' }, { rid: 't2', name: 'Oversize Tişört', variant: 'Siyah / XL', sku: 'TSH-11-2' },
    { rid: 't3', name: 'Type-C Kablo', sku: 'ABC-123' }]);
  await autoMatch(w.db);
  assert.equal(await w.linkOf('t1', 'hepsiburada'), null);
  assert.equal(await w.linkOf('t2'), null);
  assert.equal(await w.linkOf('t3'), 'C');
  assert.equal(skuEq('TSH-1-12', 'TSH-11-2'), false);
  assert.equal(skuEq('044650D010', '04465-0D010'), true);
});

test('ölçü / yaş / numara / vitamin / model farkı: ne kesin eşleşir ne de toplu onayla bağlanır', async () => {
  const w = await world([P('A', 'Ahşap Yapboz 3 Yaş', ''), P('B', 'Vitamin C 1000 mg 30 Tablet', ''), P('C', 'Bebek Bezi 4 Numara 40 Adet', ''), P('D', 'Powerbank 10000 mAh Siyah', ''),
    P('E', 'iPhone 15 Şeffaf Silikon Kılıf', ''), P('F', 'Granit Tava 28 cm Gri', '')],
  [{ rid: 'n1', ch: 'n11', name: 'Ahşap Yapboz 5 Yaş' }, { rid: 'n2', ch: 'n11', name: 'Vitamin D 1000 mg 30 Tablet' }, { rid: 'n3', ch: 'n11', name: 'Bebek Bezi 5 Numara 40 Adet' },
    { rid: 'n4', ch: 'n11', name: 'Powerbank 20000 mAh Siyah' }, { rid: 'n5', ch: 'n11', name: 'iPhone 15 Pro Şeffaf Silikon Kılıf' }, { rid: 'n6', ch: 'n11', name: 'Gri Granit Tava 28 cm' }]);
  await autoMatch(w.db);
  await approveConfident(w.db, { min: 85, gap: 15 });
  for (const r of ['n1', 'n2', 'n3', 'n4', 'n5']) assert.equal(await w.linkOf(r, 'n11'), null, r);
  assert.equal(await w.linkOf('n6', 'n11'), 'F', 'aynı ürün (kelime sırası farklı) toplu onayla bağlanır');
  // Birim dönüşümleri ve set / adet ayrımı
  assert.deepEqual([...quantities('0,25 kg')], [...quantities('250 gr')]);
  assert.deepEqual([...quantities('1 TB')], [...quantities('1000 GB')]);
  assert.ok(quantities('128 GB').size && quantities('40 Yaprak').size && quantities('4 Numara').size);
  assert.notEqual(fullKey('Çelik Tencere Set 24 cm'), fullKey('Çelik Tencere 24 cm'));
  assert.notEqual(fullKey('Kurşun Kalem HB x 12'), fullKey('Kurşun Kalem HB'));
  // Barkod biçimleri: liste alanı, Excel bilimsel gösterimi (tam / kesik), ISBN-10, kısa iç kodda sıfırlar
  assert.equal(normBc('8.000500310427E+12'), normBc('8000500310427'));
  assert.equal(normBc('8.69E+12'), '');
  assert.equal(normBc('9753638027'), normBc('9789753638029'));
  assert.notEqual(normBc('000123456'), normBc('123456'));
});

test('sipariş satırı çözümü: belirsiz barkod bağlanmaz, kaldırılan ilan eşleşmesi koda rağmen bağlanmaz, zayıf kod barkoda karşı oy kullanmaz', async () => {
  const db = d1(); await init(db);
  const id = async (sku, bc) => (await db.prepare("INSERT INTO products (sku, barcode, name, stock, active, created_at, updated_at) VALUES (?, ?, 'x', 5, 1, 0, 0) RETURNING id").bind(sku, bc).first()).id;
  const a = await id('S1', '8692000000011'), b = await id('S2', '8692000000011'), c = await id('ABC123', null), d = await id('12', null), e = await id('KDT-60', '8694000000011');
  await db.prepare("INSERT INTO listings (channel, remote_id, sku, barcode, name, match) VALUES ('trendyol', 'T1', 'ABC123', '', 'x', ?)").bind('x:' + c).run();
  const m = await productMaps(db);
  assert.equal(m.resolve('trendyol', { sku: '', barcode: '8692000000011' }), null, 'iki ürün aynı barkod');
  assert.ok([a, b].length === 2);
  assert.equal(m.resolve('trendyol', { sku: 'ABC123', barcode: '', remoteKey: 'T1' }), null, 'kullanıcı bu ilanın eşleşmesini kaldırdı');
  assert.equal(m.resolve('trendyol', { sku: 'abc-123 ', barcode: '' }), c);
  assert.equal(m.resolve('trendyol', { sku: '12', barcode: '8694000000011' }), e);
  assert.ok(d);
  // relinkItems aynı kuralları kullanır
  await db.prepare("INSERT INTO orders (id, channel, remote_id, status, ordered_at) VALUES ('trendyol:1', 'trendyol', '1', 'new', 0)").run();
  await db.prepare("INSERT INTO order_items (order_id, line_id, product_id, sku, barcode, name, quantity, remote_key) VALUES ('trendyol:1', '1', NULL, '', '8692000000011', 'x', 1, ''), ('trendyol:1', '2', NULL, 'ABC123', '', 'x', 1, 'T1')").run();
  await relinkItems(db);
  assert.deepEqual((await all(db, "SELECT product_id FROM order_items ORDER BY line_id")).map((r) => r.product_id), [null, null]);
});

// ---------- kategori ----------
const TREE = ['Kadın › Giyim › Elbise', 'Kadın › Giyim › Tişört', 'Erkek › Giyim › Tişört', 'Çocuk › Kız Çocuk › Elbise', 'Çocuk › Erkek Çocuk › Tişört', 'Anne & Bebek › Bebek Bakım › Bebek Şampuanı',
  'Kozmetik › Saç Bakım › Şampuan', 'Elektronik › Telefon Aksesuarları › Telefon Kılıfı', 'Elektronik › Tablet Aksesuarları › Tablet Kılıfı', 'Pet Shop › Kedi › Kedi Maması', 'Pet Shop › Köpek › Köpek Maması',
  'Pet Shop › Akvaryum › Akvaryum Bitki Gübresi', 'Bahçe › Gübre', 'Ev & Yaşam › Mutfak › Tencere', 'Spor › Fitness › Yoga Matı']
  .map((p, i) => { const s = p.split(' › '); return { id: String(100 + i), name: s.pop(), path: s.join(' › ') }; });
const top = (local, names) => { const r = rank(TREE, local, names, 5); return { r, best: r[0] && `${r[0].path} › ${r[0].name}`, sure: !!confident(r) }; };

test('kategori: cinsiyet / yaş / tür / cihaz tuzaklarında yanlış kategori "kesin" olmaz', () => {
  const cases = [
    ['Erkek › Tişört', ['Erkek Basic Tişört', 'Erkek Polo Yaka Tişört'], 'Erkek › Giyim › Tişört'],
    ['Elbise', ['Kadın Midi Elbise', 'Kadın Mini Elbise'], 'Kadın › Giyim › Elbise'],
    ['Kız Çocuk › Elbise', ['Kız Çocuk Prenses Elbise'], 'Çocuk › Kız Çocuk › Elbise'],
    ['Bebek Şampuanı', ['Bebek Şampuanı 200 ml'], 'Anne & Bebek › Bebek Bakım › Bebek Şampuanı'],
    ['Köpek Maması', ['Kuzu Etli Köpek Maması 15 Kg'], 'Pet Shop › Köpek › Köpek Maması'],
    ['Kılıf', ['iPhone 15 Pro Kılıf', 'Redmi Note 13 Kılıf'], 'Elektronik › Telefon Aksesuarları › Telefon Kılıfı'],
    ['Tablet Kılıfları', ['iPad 10. Nesil Akıllı Kılıf', 'Galaxy Tab A9 Kılıf'], 'Elektronik › Tablet Aksesuarları › Tablet Kılıfı'],
    ['Bahçe › Gübre › Sıvı Gübre', ['Sıvı Organik Gübre 1 L'], 'Bahçe › Gübre'],
  ];
  for (const [local, names, want] of cases) {
    const t = top(local, names);
    assert.ok(t.best === want || !t.sure, `${local} → ${t.best} kesin işaretlendi`);
    assert.ok(t.r.some((x) => `${x.path} › ${x.name}` === want), `${local}: doğru kategori önerilerde yok`);
  }
  assert.equal(top('Erkek › Tişört', ['Erkek Basic Tişört']).best, 'Erkek › Giyim › Tişört');
  const g = top('Gübreler', ['Solucan Gübresi 5 Kg']);
  assert.equal(g.best, 'Bahçe › Gübre'); assert.ok(g.sure, 'bahçe gübresi: akvaryum gübresi ancak zayıf alternatif');
});

test('kategori: genel yerel kategori ("Diğer", "Kampanyalı Ürünler", "Yeni Gelenler") hiçbir zaman kesin olmaz', () => {
  for (const [local, names] of [['Diğer', ['Kedi Maması 1,5 Kg', 'Çelik Tencere']], ['Kampanyalı Ürünler', ['Kadın Elbise', 'Erkek Tişört']], ['Yeni Gelenler', ['Kadın Midi Elbise', 'Kadın Saten Elbise']]]) {
    assert.equal(top(local, names).sure, false, local);
  }
});

// ---------- yaşam döngüsü (gerçek API, sahte Trendyol / ikas) ----------
async function api(tree, ikasCats) {
  const db = d1(); await init(db); resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', DB: db, TRENDYOL_SELLER_ID: '123', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's', IKAS1_STORE: 'magaza', IKAS1_CLIENT_ID: 'i', IKAS1_CLIENT_SECRET: 'c', IKAS1_STOCK_LOCATION_ID: 'loc1' };
  for (const c of ['trendyol', 'ikas1']) await setSetting(db, 'automap2:' + c, Date.now());
  const real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u.startsWith('https://panel.test')) return real(url, opts);
    let body = {}; try { body = JSON.parse(opts.body); } catch { /* form */ }
    const J = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
    if (/product-categories$/.test(u)) return J({ categories: [{ id: 1, name: 'Bahçe', subCategories: tree.list }] });
    if (/\/product\/categories\/\d+\/attributes$/.test(u)) return J({ categoryAttributes: [{ attribute: { id: 1192, name: 'Menşei' }, required: true, allowCustom: false, attributeValues: [{ id: 10617, name: 'TR' }, { id: 10618, name: 'CN' }] }] });
    if (/oauth\/token/.test(u)) return J({ access_token: 'T', expires_in: 3600 });
    if (/graphql/.test(u) && /listCategory/.test(body.query || '')) return J({ data: { listCategory: ikasCats } });
    return J({ data: {}, content: [], totalPages: 1 });
  };
  let cookie = '';
  const call = async (path, o = {}) => {
    const r = await worker.fetch(new Request('https://panel.test/api/' + path, { ...o, body: o.body && JSON.stringify(o.body), headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r.json();
  };
  await call('login', { method: 'POST', body: { password: 'x-123456' } });
  return { db, env, call, done: () => { globalThis.fetch = real; resetChannels(); } };
}

test('kaldırılan kategori eşleşmesi günlük öneri + "kesinleri otomatik onayla" ile geri gelmez; kanalda silinen kategori "kaldırılmış" görünür', async () => {
  const tree = { list: [{ id: 2001, name: 'Organik Gübre', subCategories: [] }, { id: 2002, name: 'Saksı Toprağı', subCategories: [] }, { id: 2003, name: 'Kimyevi Gübre', subCategories: [] }] };
  const x = await api(tree, []);
  try {
    const t = Date.now();
    await run(x.db, "INSERT INTO products (sku, barcode, name, brand, category, image, sale_price, stock, created_at, updated_at) VALUES ('A', 'BA', 'Solucan Gübresi 5 Kg', 'HG', 'Gübre', 'https://x/a.jpg', 100, 5, ?, ?)", t, t);
    await x.call('catalog/automap-all', { method: 'POST', body: {} });
    await x.call('catalog/approve-sure', { method: 'POST', body: {} });
    const m0 = await first(x.db, "SELECT remote_id, attrs FROM category_map WHERE local = 'Gübre' AND channel = 'trendyol'");
    assert.equal(m0.remote_id, '2001');
    assert.equal(JSON.parse(m0.attrs)[1192].value, 'TR', 'Menşei: mağaza ayarı (varsayılan Türkiye)');
    await x.call('catalog/unmap', { method: 'POST', body: { local: 'Gübre', channel: 'trendyol' } });
    await setSetting(x.db, 'auto_approve_sure', true);
    await setSetting(x.db, 'automap2:trendyol', 0);
    await autoSuggest(x.env, x.db);
    assert.equal(await first(x.db, "SELECT remote_id FROM category_map WHERE local = 'Gübre' AND channel = 'trendyol'"), null);
    const sg = await first(x.db, "SELECT remote_id, sure, rejected FROM category_suggest WHERE local = 'Gübre' AND channel = 'trendyol'");
    assert.ok(JSON.parse(sg.rejected).includes('2001')); assert.notEqual(sg.remote_id, '2001'); assert.equal(sg.sure, 0);
    // Kanal kategoriyi kaldırdı: eşleşme "stale"
    await run(x.db, "INSERT INTO category_map (local, channel, remote_id, remote_name, attrs, updated_at, user) VALUES ('Gübre', 'trendyol', '2003', 'Kimyevi Gübre', '{}', 0, 'u')");
    tree.list = tree.list.filter((c) => c.id !== 2003); resetChannels();
    const mx = await x.call('catalog/matrix');
    assert.equal(mx.cells['Gübre'].trendyol.state, 'stale');
    assert.match(mx.cells['Gübre'].trendyol.note, /kanalda kaldırılmış/);
    assert.ok(await first(x.db, "SELECT 1 FROM notices WHERE key = 'catstale:trendyol' AND resolved_at IS NULL"));
  } finally { x.done(); }
});

test('site kategorisi: aynı adlı tek kategori bile olsa cinsiyet / yaş çelişiyorsa kesin değil; tam yol aynıysa kesin', async () => {
  const x = await api({ list: [] }, [{ id: 'k1', name: 'Kız Çocuk', parentId: null }, { id: 'k2', name: 'Elbise', parentId: 'k1' }, { id: 'k3', name: 'Kadın', parentId: null }, { id: 'k4', name: 'Tişört', parentId: 'k3' }]);
  try {
    const t = Date.now();
    for (const [sku, name, cat] of [['A', 'Kadın Midi Elbise', 'Kadın › Giyim › Elbise'], ['B', 'Kadın Basic Tişört', 'Kadın › Tişört']]) {
      await run(x.db, "INSERT INTO products (sku, name, category, sale_price, stock, created_at, updated_at) VALUES (?, ?, ?, 100, 5, ?, ?)", sku, name, cat, t, t);
    }
    await x.call('catalog/automap-all', { method: 'POST', body: { channels: ['ikas1'] } });
    const mx = await x.call('catalog/matrix');
    assert.equal(mx.cells['Kadın › Giyim › Elbise'].ikas1.remote_id, 'k2');
    assert.equal(mx.cells['Kadın › Giyim › Elbise'].ikas1.sure, false);
    assert.equal(mx.cells['Kadın › Tişört'].ikas1.sure, true);
  } finally { x.done(); }
});

test('kanalda artık olmayan ilan (tam liste okununca) bağdan çıkar, yeni kimlikli ilan aynı ürüne bağlanır; eksik okumada dokunulmaz', async () => {
  const w = await world([P('A', 'Termos 500 ml', '', null, '8698000000011'), P('B', 'Kamp Çadırı 4 Kişilik', '', null, '8698000000028')], []);
  const ch = (rows) => ({ id: 'trendyol', fetchListings: async () => rows });
  const L = (id, bc, name) => ({ remoteId: id, remoteProductId: 'g' + id, barcode: bc, name, stock: 3 });
  await refreshListings(w.db, ch([L('OLD', '8698000000011', 'Termos 500 ml'), L('T2', '8698000000028', 'Kamp Çadırı 4 Kişilik')]));
  await autoMatch(w.db);
  assert.equal(await w.linkOf('OLD'), 'A');
  // Eksik okuma (kanal "partial" dedi): hiçbir ilan "gone" olmaz
  const part = [L('NEW', '8698000000011', 'Termos 500 ml'), L('T2', '8698000000028', 'Kamp Çadırı 4 Kişilik')]; part.partial = true;
  await refreshListings(w.db, ch(part));
  assert.equal(await w.linkOf('OLD'), 'A');
  // Tam liste: OLD artık yok → bağı kalkar, NEW aynı ürüne bağlanır, OLD'a stok gitmez
  await refreshListings(w.db, ch([L('NEW', '8698000000011', 'Termos 500 ml'), L('T2', '8698000000028', 'Kamp Çadırı 4 Kişilik')]));
  await autoMatch(w.db);
  assert.deepEqual(await first(w.db, "SELECT product_id, match FROM listings WHERE remote_id = 'OLD'"), { product_id: null, match: 'gone' });
  assert.equal(await w.linkOf('NEW'), 'A');
  assert.equal(await w.linkOf('T2'), 'B');
  // İlan geri gelirse eski haline döner (yeniden eşleştirmeye girer)
  await refreshListings(w.db, ch([L('OLD', '8698000000011', 'Termos 500 ml'), L('NEW', '8698000000011', 'Termos 500 ml'), L('T2', '8698000000028', 'Kamp Çadırı 4 Kişilik')]));
  assert.deepEqual(await first(w.db, "SELECT match, ignored FROM listings WHERE remote_id = 'OLD'"), { match: null, ignored: 0 });
});

test('çok eksenli varyant ("Kırmızı / XL"): her özellik kendi eksenini alır; tek özelliğe bütün metin serbest değer olarak gitmez', async () => {
  const VALUES = { renk: [{ id: 1, value: 'Kırmızı' }, { id: 2, value: 'Siyah' }], beden: [{ id: 11, value: 'XL' }, { id: 12, value: 'M' }, { id: 13, value: '42' }], hacim: [{ id: 21, value: '0.5 Lt' }, { id: 22, value: '1 Lt' }, { id: 23, value: '5 Kg' }] };
  const pick = picker({ catalog: { values: async (_c, a) => VALUES[a] || [] } }, '1');
  assert.equal((await pick({ id: 'renk' }, 'Kırmızı / XL')).value, 'Kırmızı');
  assert.equal((await pick({ id: 'beden' }, 'Kırmızı / XL')).value, 'XL');
  assert.equal((await pick({ id: 'beden' }, 'Siyah / 42')).value, '42');
  assert.equal((await pick({ id: 'hacim' }, '500 ml')).value, '0.5 Lt');
  assert.equal((await pick({ id: 'hacim' }, '6 Adet / 1 Lt')).value, '1 Lt');
  assert.equal(await pick({ id: 'renk' }, 'XL'), null);
  // N11: serbest değere izin veren Renk özelliği listede eşleşme bulamazsa "Kırmızı / XL" gönderilmez, eksik olarak sorulur
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ id: 5, categoryAttributes: [
    { attributeId: 7, attributeName: 'Renk', isMandatory: true, isVariant: true, isCustomValue: true, attributeValues: [] },
    { attributeId: 1, attributeName: 'Marka', isMandatory: true, isVariant: false, isCustomValue: true, attributeValues: [] }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    const c = n11({ N11_APP_KEY: 'k', N11_APP_SECRET: 's' }, { id: 'n11' });
    const pr = { sku: 'T1', barcode: '8690000000011', name: 'Tişört', brand: 'X', image: 'https://i/1.jpg', price: 10, stock: 1, vat: 20, variant: 'Kırmızı / XL' };
    const b = await c.catalog.build(pr, { remote_id: '5', attrs: { 7: { value: '@variant' } } }, { opts: { shipmentTemplate: 'S', preparingDay: 1 }, pick: picker(c, '5') });
    assert.ok(!JSON.stringify(b.payload.attributes).includes('Kırmızı / XL'));
    assert.ok(b.missing.includes('Renk'));
    const one = await c.catalog.build({ ...pr, variant: 'Kırmızı' }, { remote_id: '5', attrs: { 7: { value: '@variant' } } }, { opts: { shipmentTemplate: 'S', preparingDay: 1 }, pick: picker(c, '5') });
    assert.ok(JSON.stringify(one.payload.attributes).includes('"customValue":"Kırmızı"'));
  } finally { globalThis.fetch = real; }
});
