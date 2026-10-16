// Kargonomi denetim düzeltmeleri: teklif numarası sunucuda sipariş / pakete bağlı, silinmiş gönderi (404) paketi kilitlemez,
// bildirim yalnız ilk tespitte, iptal talebi "oluşturuldu" ile ezilmez, kesin ücret teslimde, çift "Kargoya ver" yok,
// carrierCancelDone gönderi numarasını denetler, takip turunun erken çıkışı.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, setSetting } from '../src/db.js';
import { saveOrders } from '../src/sync.js';
import worker from '../src/index.js';
import * as kargonomi from '../src/carriers/kargonomi.js';

const order = (id, extra = {}) => ({
  remoteId: id, orderNumber: id, orderedAt: Date.now(), status: 'new', remoteStatus: 'Created', customer: 'Ayşe Yılmaz', phone: '05321234567',
  address: { name: 'Ayşe Yılmaz', line: 'Atatürk Cd. No 5', district: 'Selçuklu', city: 'Konya', phone: '05321234567' }, total: 200,
  items: [{ lineId: id + '-1', sku: 'A', barcode: '111', name: 'Ürün A', quantity: 2, unitPrice: 100, total: 200, status: '', remoteKey: '111' }],
  packages: null, ...extra,
});

async function panel() {
  const env = { PANEL_PASSWORD: 'pw-123456', PANEL_SECRET: 'sir', DB: d1() };
  await init(env.DB);
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: env.cookie || '' } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) env.cookie = r.headers.get('set-cookie').split(';')[0];
    return { status: r.status, body: await r.json() };
  };
  await call('/api/login', { method: 'POST', body: JSON.stringify({ password: 'pw-123456' }) });
  const post = (path, b) => call(path, { method: 'POST', body: JSON.stringify(b || {}) });
  await setSetting(env.DB, 'sender', { name: 'HasTürk', phone: '03320000000', address: 'Sanayi Cd. 1', city: 'Selçuklu / Konya' });
  await call('/api/integrations/carriers/kargonomi', { method: 'PUT', body: JSON.stringify({ values: { KARGONOMI_API_KEY: 'k' } }) });
  return { env, call, post };
}

// Sahte Kargonomi: gönderiler bellekte; silinen gönderi 404 döner
function fakeKargonomi() {
  const real = globalThis.fetch, calls = [], ships = new Map();
  let n = 100;
  const J = (x, s = 200) => new Response(JSON.stringify(x), { status: s, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = async (url, o = {}) => {
    const u = String(url), m = o.method || 'GET';
    calls.push(`${m} ${u}` + (o.body ? ' ' + o.body : ''));
    if (/\/states$/.test(u)) return J({ data: [{ id: 42, name: 'KONYA' }] });
    if (/\/cities\/42$/.test(u)) return J({ data: [{ id: 600, name: 'SELÇUKLU' }] });
    if (/\/warehouses$/.test(u)) return J({ data: [{ id: 1, is_main: 1 }] });
    if (m === 'POST' && /\/shipments$/.test(u)) { const id = ++n; ships.set(id, { id, status: 'draft', estimated_price: '40' }); return J({ data: { id, status: 'draft' } }); }
    if (/shipment-price-comparison\/(\d+)$/.test(u)) return J({ shipping_provider_with_price: [{ id: 11, name: 'Aras Kargo', slug: 'aras', price: '50' }, { id: 14, name: 'Yurtiçi Kargo', slug: 'yurtici', price: '60' }] });
    if (/confirm-shipping-price/.test(u)) {
      const s = ships.get(JSON.parse(o.body).shipment_id);
      if (!s) return J({ message: 'Not found' }, 404);
      if (s.status !== 'draft') return J({ message: 'Gönderi zaten onaylandı' }, 422);
      Object.assign(s, { status: 'webservice_order_created', shipping_webservice_tracking_code: 'AR' + s.id, shipping_provider_name: 'Aras Kargo' });
      return J({});
    }
    if (/shipments\/cancel$/.test(u)) { const s = ships.get(JSON.parse(o.body).shipment_id); if (s) s.status = s.cancelTo || 'request_for_cancellation'; return J({ message: 'ok' }); }
    let x;
    if ((x = /\/shipments\/(\d+)\/barcode/.exec(u))) return J({ data: { barcode: 'JVBERi0' + 'C'.repeat(150) } });
    if ((x = /\/shipments\/(\d+)$/.exec(u))) {
      const s = ships.get(Number(x[1]));
      if (!s) return J({ message: 'No query results' }, 404);
      if (m === 'DELETE') { ships.delete(s.id); return new Response(null, { status: 204 }); }
      return J({ data: s });
    }
    return new Response('?', { status: 404 });
  };
  return { calls, ships, restore: () => { globalThis.fetch = real; } };
}

test('teklif numarası sunucuda doğrulanır: başka siparişin / paketin teklifi, onaylı gönderi numarası ve sayı olmayan numara reddedilir; vazgeç yalnız bu siparişin taslağını siler', async () => {
  const k = fakeKargonomi();
  try {
    const { env, post } = await panel();
    await saveOrders(env.DB, 'woocommerce', [order('Q1'), order('Q2'), order('Q3')]);
    const q1 = encodeURIComponent('woocommerce:Q1'), q2 = encodeURIComponent('woocommerce:Q2'), q3 = encodeURIComponent('woocommerce:Q3');
    let r = await post(`/api/orders/${q1}/carrier-quote`, { provider: 'kargonomi' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const quote1 = r.body.quote_id;
    // Başka siparişin teklifi
    r = await post(`/api/orders/${q2}/carrier-label`, { provider: 'kargonomi', quote_id: quote1, firm_id: '11' });
    assert.equal(r.status, 400); assert.match(r.body.error, /teklifi bu pakete ait değil/);
    assert.ok(!k.calls.some((c) => /confirm-shipping-price/.test(c)), 'başka siparişin taslağı onaylanmadı');
    // Sayı olmayan numara (yol ekleme denemesi)
    r = await post(`/api/orders/${q2}/carrier-label`, { provider: 'kargonomi', quote_id: '101/../7', firm_id: '11' });
    assert.equal(r.status, 400); assert.match(r.body.error, /Geçersiz teklif/);
    // Vazgeç başka siparişten gelirse taslak silinmez
    await post(`/api/orders/${q2}/carrier-quote-cancel`, { provider: 'kargonomi', quote_id: quote1 });
    assert.ok(!k.calls.some((c) => c.startsWith('DELETE ')), 'başka siparişin taslağı silinmedi');
    // Kendi siparişinde: onaylanır
    r = await post(`/api/orders/${q1}/carrier-label`, { provider: 'kargonomi', quote_id: quote1, firm_id: '11' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const ref1 = (await env.DB.prepare("SELECT carrier_ref FROM packages WHERE order_id = 'woocommerce:Q1'").first()).carrier_ref;
    assert.equal(ref1, quote1);
    // Onaylı gönderinin numarası teklif diye başka siparişte kullanılamaz; onay hatasında da başka paketin gönderisi iptal edilmez
    r = await post(`/api/orders/${q3}/carrier-label`, { provider: 'kargonomi', quote_id: ref1, firm_id: '11' });
    assert.equal(r.status, 400);
    assert.ok(!k.calls.some((c) => /shipments\/cancel/.test(c)), 'başka paketin canlı gönderisi iptal edilmedi');
    assert.equal(k.ships.get(Number(ref1)).status, 'webservice_order_created');
    // Kullanılmış teklif aynı siparişte yeniden kullanılamaz (kayıt silindi)
    r = await post(`/api/orders/${q1}/carrier-quote-cancel`, { provider: 'kargonomi', quote_id: quote1 });
    assert.ok(!k.calls.some((c) => c.startsWith('DELETE ')));
    // Kendi siparişinin vazgeçilen teklifi silinir
    r = await post(`/api/orders/${q3}/carrier-quote`, { provider: 'kargonomi' });
    await post(`/api/orders/${q3}/carrier-quote-cancel`, { provider: 'kargonomi', quote_id: r.body.quote_id });
    assert.ok(k.calls.some((c) => c.startsWith('DELETE ') && c.endsWith(`/shipments/${r.body.quote_id}`)));
    // Bölünmüş siparişte paket A'nın teklifi paket B'de kullanılamaz
    await saveOrders(env.DB, 'woocommerce', [order('Q4', { items: [{ lineId: 'Q4-1', sku: 'A', barcode: '111', name: 'Ürün A', quantity: 2, unitPrice: 100, total: 200, status: '', remoteKey: '111' }] })]);
    const q4 = encodeURIComponent('woocommerce:Q4');
    r = await post(`/api/orders/${q4}/split`, { groups: [{ items: [{ line_id: 'Q4-1', qty: 1 }] }, { items: [{ line_id: 'Q4-1', qty: 1 }] }] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    r = await post(`/api/orders/${q4}/carrier-quote`, { provider: 'kargonomi', all: true });
    const [pa, pb] = r.body.packages;
    r = await post(`/api/orders/${q4}/carrier-label`, { provider: 'kargonomi', package_id: pb.package_id, quote_id: pa.quote_id, firm_id: '11' });
    assert.equal(r.status, 400); assert.match(r.body.error, /bu pakete ait değil/);
    r = await post(`/api/orders/${q4}/carrier-label`, { provider: 'kargonomi', all: true, quotes: { [pa.package_id]: { quote_id: pa.quote_id, firm_id: '11' }, [pb.package_id]: { quote_id: pb.quote_id, firm_id: '14' } } });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.packages.length, 2);
  } finally { k.restore(); }
});

test('Kargonomi bağlantısı: yol parametreleri kodlanır; teklif ekranının taslağı (draftId) onay hatasında iptal / silinmez, onay işlendiyse gönderi bağlanır', async () => {
  const calls = [];
  let status = 'draft', confirmFails = true;
  const real = globalThis.fetch;
  globalThis.fetch = async (url, o = {}) => {
    const u = String(url), m = o.method || 'GET', J = (x, s = 200) => new Response(JSON.stringify(x), { status: s, headers: { 'Content-Type': 'application/json' } });
    calls.push(`${m} ${u}`);
    if (/shipment-price-comparison/.test(u)) return J({ shipping_provider_with_price: [] });
    if (/confirm-shipping-price/.test(u)) return confirmFails ? J({ message: 'Server Error' }, 500) : J({});
    if (/\/shipments\/55\/barcode/.test(u)) return J({ data: { barcode: 'JVBERi0' + 'C'.repeat(150) } });
    if (/\/shipments\/55$/.test(u)) return J({ data: { id: 55, status, shipping_webservice_tracking_code: status === 'draft' ? null : 'AR55', shipping_provider_name: 'Aras Kargo', estimated_price: '40' } });
    if (/\/shipments\/cancel$/.test(u)) return J({});
    return J({ message: 'Not found' }, 404);
  };
  try {
    const a = kargonomi.make({ KARGONOMI_API_KEY: 't' });
    await a.discard('1/../warehouses?x=1');
    assert.ok(calls.some((c) => c.includes('/shipments/1%2F..%2Fwarehouses%3Fx%3D1')), calls.join('\n'));
    await a.track({ carrier_ref: '7?a=b' }).catch(() => null);
    assert.ok(calls.some((c) => c.endsWith('/shipments/7%3Fa%3Db')));
    // Onay 500 + taslak kaldı: iptal / silme yok
    let n0 = calls.length;
    await assert.rejects(a.create({}, { draftId: '55', providerId: '11', noWait: true }));
    assert.ok(!calls.slice(n0).some((c) => /DELETE|shipments\/cancel/.test(c)), calls.slice(n0).join('\n'));
    // Onay 500 + durum okunamadı: iptal yok
    const realF = globalThis.fetch;
    globalThis.fetch = async (url, o = {}) => (/\/shipments\/55$/.test(String(url)) ? new Response('x', { status: 503 }) : realF(url, o));
    n0 = calls.length;
    await assert.rejects(a.create({}, { draftId: '55', providerId: '11', noWait: true }));
    assert.ok(!calls.slice(n0).some((c) => /DELETE|shipments\/cancel/.test(c)));
    globalThis.fetch = realF;
    // Onay 500 ama Kargonomi işlemiş: gönderi panele bağlanır (iptal edilmez)
    status = 'webservice_order_created';
    n0 = calls.length;
    const r = await a.create({}, { draftId: '55', providerId: '11', noWait: true });
    assert.equal(r.ref, '55'); assert.equal(r.tracking, 'AR55');
    assert.ok(!calls.slice(n0).some((c) => /DELETE|shipments\/cancel/.test(c)));
  } finally { globalThis.fetch = real; }
});

test('Kargonomi: silinmiş gönderi (404) — iptal kesin sayılır, takipte bir kez bildirilir; kesin ücret yalnız teslimde', async () => {
  const k = fakeKargonomi();
  try {
    const a = kargonomi.make({ KARGONOMI_API_KEY: 't' });
    assert.deepEqual(await a.cancel('999'), { done: true, gone: true });
    assert.equal((await a.track({ carrier_ref: '999' })).gone, true);
    // real_price onay anında dolu: tahmini sayılır (kesin değil); teslim edilince kesin
    k.ships.set(500, { id: 500, status: 'webservice_order_created', estimated_price: '40', real_price: '42' });
    let t = await a.track({ carrier_ref: '500' });
    assert.deepEqual([t.cost, t.costKnown, t.costFinal], [42, true, false]);
    k.ships.get(500).status = 'webservice_shipment_delivered'; k.ships.get(500).real_price = '58';
    t = await a.track({ carrier_ref: '500' });
    assert.deepEqual([t.cost, t.costFinal, t.state], [58, true, 'delivered']);

    const { env, post } = await panel();
    const { trackCarriers, GONE_MSG } = await import('../src/carriers.js');
    await saveOrders(env.DB, 'woocommerce', [order('G1')]);
    const g1 = encodeURIComponent('woocommerce:G1');
    let r = await post(`/api/orders/${g1}/carrier-label`, { provider: 'kargonomi', firm_id: '11' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const pk = await env.DB.prepare("SELECT id, carrier_ref, carrier_cost_final FROM packages WHERE order_id = 'woocommerce:G1'").first();
    assert.equal(pk.carrier_cost_final, null);
    k.ships.delete(Number(pk.carrier_ref)); // Kargonomi panelinden silindi
    await trackCarriers(env, env.DB, { force: true });
    const notice = () => env.DB.prepare(`SELECT count, read FROM notices WHERE key = 'carrier:gone:${pk.id}'`).first();
    assert.equal((await notice()).count, 1);
    assert.equal((await env.DB.prepare('SELECT error FROM packages WHERE id = ?').bind(pk.id).first()).error, GONE_MSG);
    await env.DB.prepare('UPDATE notices SET read = 1').run();
    await trackCarriers(env, env.DB, { force: true });
    assert.deepEqual({ ...(await notice()) }, { count: 1, read: 1 }, 'bildirim yeniden açılmadı');
    // Seyrek takip: 3 saat önce sorgulanmışsa (olağan aralık 2 saat) sorgulanmaz
    await env.DB.prepare('UPDATE packages SET carrier_checked_at = ? WHERE id = ?').bind(Date.now() - 3 * 3600e3, pk.id).run();
    const n0 = k.calls.length;
    await trackCarriers(env, env.DB);
    assert.equal(k.calls.slice(n0).filter((c) => c.includes(`/shipments/${pk.carrier_ref}`)).length, 0);
    // Paket menüsünden iptal: 404 kesin iptal sayılır, paket serbest kalır
    r = await post(`/api/orders/${g1}/carrier-cancel`, { package_id: pk.id });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.match(r.body.message, /bulunamadı/);
    const after = await env.DB.prepare('SELECT carrier_ref, error FROM packages WHERE id = ?').bind(pk.id).first();
    assert.deepEqual([after.carrier_ref, after.error], [null, null]);
  } finally { k.restore(); }
});

test('yetim gönderi bildirimi yalnız ilk tespitte ve seyrek sorgu; iptal talebi "oluşturuldu" ile ezilmez, yalnız yolda / teslimde "kabul edilmedi"', async () => {
  const k = fakeKargonomi();
  try {
    const { env, post } = await panel();
    const { trackCarriers } = await import('../src/carriers.js');
    await saveOrders(env.DB, 'woocommerce', [order('O1'), order('C1')]);
    let r = await post(`/api/orders/${encodeURIComponent('woocommerce:O1')}/carrier-label`, { provider: 'kargonomi', firm_id: '11' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const o1 = await env.DB.prepare("SELECT id, carrier_ref FROM packages WHERE order_id = 'woocommerce:O1'").first();
    await env.DB.prepare("UPDATE orders SET status = 'cancelled' WHERE id = 'woocommerce:O1'").run();
    await trackCarriers(env, env.DB, { force: true });
    const notice = () => env.DB.prepare(`SELECT count, read FROM notices WHERE key = 'carrier:orphan:${o1.id}'`).first();
    assert.equal((await notice()).count, 1);
    await env.DB.prepare('UPDATE notices SET read = 1').run();
    await trackCarriers(env, env.DB, { force: true });
    assert.deepEqual({ ...(await notice()) }, { count: 1, read: 1 }, 'her turda yeniden açılmaz');
    // Seyrek: 3 saat önce sorgulanan yetim gönderi sorgulanmaz, 13 saat önce sorgulanan sorgulanır
    const hits = () => k.calls.filter((c) => c.endsWith(`/shipments/${o1.carrier_ref}`)).length;
    await env.DB.prepare('UPDATE packages SET carrier_checked_at = ? WHERE id = ?').bind(Date.now() - 3 * 3600e3, o1.id).run();
    let h = hits(); await trackCarriers(env, env.DB); assert.equal(hits(), h);
    await env.DB.prepare('UPDATE packages SET carrier_checked_at = ? WHERE id = ?').bind(Date.now() - 13 * 3600e3, o1.id).run();
    h = hits(); await trackCarriers(env, env.DB); assert.equal(hits(), h + 1);

    // İptal talebi: Kargonomi durumu hâlâ "oluşturuldu" — cancelling korunur, "kabul edilmedi" yok
    const c1 = encodeURIComponent('woocommerce:C1');
    r = await post(`/api/orders/${c1}/carrier-label`, { provider: 'kargonomi', firm_id: '11' });
    const p1 = await env.DB.prepare("SELECT id, carrier_ref FROM packages WHERE order_id = 'woocommerce:C1'").first();
    k.ships.get(Number(p1.carrier_ref)).cancelTo = 'webservice_order_created';
    r = await post(`/api/orders/${c1}/carrier-cancel`, { package_id: p1.id });
    assert.equal(r.body.pending, true, JSON.stringify(r.body));
    await trackCarriers(env, env.DB, { force: true });
    const st = async () => (await env.DB.prepare('SELECT carrier_state FROM packages WHERE id = ?').bind(p1.id).first()).carrier_state;
    assert.equal(await st(), 'cancelling');
    assert.equal(await env.DB.prepare(`SELECT 1 FROM notices WHERE key = 'carrier:cancelno:${p1.id}'`).first(), null);
    assert.equal(await env.DB.prepare(`SELECT 1 FROM notices WHERE key = 'carrier:orphan:${p1.id}'`).first(), null);
    // Kargo firması paketi aldı: talep kabul edilmedi
    k.ships.get(Number(p1.carrier_ref)).status = 'webservice_shipment_started';
    await setSetting(env.DB, 'carrier_auto_ship', false);
    await trackCarriers(env, env.DB, { force: true });
    assert.equal(await st(), 'transit');
    assert.ok(await env.DB.prepare(`SELECT 1 FROM notices WHERE key = 'carrier:cancelno:${p1.id}' AND resolved_at IS NULL`).first());
  } finally { k.restore(); }
});

test('çift "Kargoya ver" engellenir; carrierCancelDone başka gönderinin kaydını silmez; takip turu gereksizse kanalları yüklemeden çıkar', async () => {
  const { env, post } = await panel();
  await saveOrders(env.DB, 'woocommerce', [order('S1', { items: [{ lineId: 'S1-1', sku: 'A', barcode: '111', name: 'Ürün A', quantity: 2, unitPrice: 100, total: 200, status: '', remoteKey: '111' }] })]);
  const s1 = encodeURIComponent('woocommerce:S1');
  let r = await post(`/api/orders/${s1}/split`, { groups: [{ items: [{ line_id: 'S1-1', qty: 1 }] }, { items: [{ line_id: 'S1-1', qty: 1 }] }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const [a, b] = (await env.DB.prepare("SELECT id FROM packages WHERE order_id = 'woocommerce:S1' ORDER BY no").all()).results;
  r = await post(`/api/orders/${s1}/ship`, { package_id: a.id, tracking: 'T1', cargo_company: 'Aras' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  r = await post(`/api/orders/${s1}/ship`, { package_id: a.id, tracking: 'T1', cargo_company: 'Aras' });
  assert.equal(r.status, 400); assert.match(r.body.error, /zaten kargoya verildi/);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM order_events WHERE order_id = 'woocommerce:S1' AND action = 'ship'").first()).n, 1);

  // carrierCancelDone: paketin gönderisi değiştiyse (eski gönderinin iptali geç işlendi) yeni gönderi korunur
  await env.DB.prepare("UPDATE packages SET carrier_provider = 'kargonomi', carrier_ref = '222', carrier_cost = 30, agreement = 'own' WHERE id = ?").bind(b.id).run();
  const { carrierCancelDone } = await import('../src/api.js');
  await carrierCancelDone(env, env.DB, 'woocommerce:S1', b.id, 'test', '111');
  assert.equal((await env.DB.prepare('SELECT carrier_ref FROM packages WHERE id = ?').bind(b.id).first()).carrier_ref, '222');
  await carrierCancelDone(env, env.DB, 'woocommerce:S1', b.id, 'test', '222');
  assert.equal((await env.DB.prepare('SELECT carrier_ref FROM packages WHERE id = ?').bind(b.id).first()).carrier_ref, null);

  // Erken çıkış: teslim edilmiş ama kargoya verilmemiş / 20 günden eski / yeniden deneme zamanı gelmemiş paket kanalları yükletmez
  const { trackCarriers } = await import('../src/carriers.js');
  const now = Date.now();
  await env.DB.prepare("UPDATE packages SET carrier_provider = 'kargonomi', carrier_state = 'delivered', carrier_ref = NULL, site_sync = NULL WHERE id = ?").bind(b.id).run(); // açık paket
  await env.DB.prepare("UPDATE packages SET carrier_provider = 'kargonomi', carrier_state = 'delivered', carrier_ref = NULL, site_sync = ?, shipped_at = ? WHERE id = ?").bind('e1:' + now, now, a.id).run();
  assert.deepEqual(await trackCarriers(env, env.DB), { checked: 0 });
  await env.DB.prepare('UPDATE packages SET site_sync = NULL, shipped_at = ? WHERE id = ?').bind(now - 25 * 86400e3, a.id).run();
  assert.deepEqual(await trackCarriers(env, env.DB), { checked: 0 });
  // Yazılacak paket var: tur çalışır
  await env.DB.prepare('UPDATE packages SET shipped_at = ? WHERE id = ?').bind(now, a.id).run();
  assert.notDeepEqual(await trackCarriers(env, env.DB), { checked: 0 });
});
