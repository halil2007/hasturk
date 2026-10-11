// Veri sağlık kontrolü (health.js): her varsayım için tutarlı (✓) ve şüpheli (⚠) örnekler, veri yokken "—", önbellek,
// destek talebi özeti, yetki ve kanal örnek okumaları (Trendyol kargo faturası türleri / Hepsiburada amount ÷ netAmount).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, setSetting } from '../src/db.js';
import {
  judgeRatio, runChecks, healthReport, ticketText, listingStateCheck, OK, WARN, NONE,
} from '../src/health.js';
import { api } from '../src/api.js';
import { resetChannels } from '../src/channels/index.js';
import { trendyol } from '../src/channels/trendyol.js';
import { hepsiburada } from '../src/channels/hepsiburada.js';

const D = 864e5, NOW = Date.parse('2026-10-11T12:00:00Z');
const SET = { commission: { trendyol: 20, hepsiburada: 18 }, costs_vat_incl: true };
const HB = { id: 'hepsiburada', type: 'hepsiburada', name: 'Hepsiburada', enabled: true, settlements: () => [], cargoCosts: () => ({ items: [] }) };
const TY = { id: 'trendyol', type: 'trendyol', name: 'Trendyol', enabled: true, settlements: () => [], cargoCosts: () => ({ items: [] }) };

async function fresh() { const db = d1(); await init(db); return db; }
const run = (db, sql, ...a) => db.prepare(sql).bind(...a).run();
// Sipariş + satırlar: lines [{ total, commission, qty, ret }]
async function order(db, ch, no, { at = NOW - 20 * D, status = 'delivered', lines = [], ship = null, ret = null } = {}) {
  const id = `${ch}:${no}`;
  await run(db, `INSERT INTO orders (id, channel, remote_id, order_number, status, ordered_at, total, currency, shipping_cost, shipping_src, return_ship_cost, return_ship_src)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'TRY', ?, ?, ?, ?)`, id, ch, no, no, status, at, lines.reduce((a, l) => a + l.total, 0), ship ? 40 : null, ship, ret ? 30 : null, ret);
  let k = 0;
  for (const l of lines) await run(db, 'INSERT INTO order_items (order_id, line_id, name, quantity, unit_price, total, status, remote_key, commission, returned_qty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, String(++k), 'Ürün', l.qty || 1, l.total / (l.qty || 1), l.total, l.status || '', l.key || 'B1', l.commission ?? null, l.ret || 0);
  return id;
}
let sid = 0;
const stl = (db, ch, no, type, amount, commission = 0, x = {}) => run(db, `INSERT INTO settlements (channel, remote_id, date, type, raw_type, order_number, amount, commission, due_date, paid)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ch, String(++sid), x.date ?? NOW - 15 * D, type, x.raw ?? '', no, amount, commission, x.due ?? NOW - 2 * D, x.paid ?? 1);
const byId = (checks, id, ch) => checks.find((c) => c.id === id && (!ch || c.channel === ch));

test('judgeRatio: ≈1 tutarlı, ≈1,20 / ≈0,83 KDV kalıbı şüpheli, az veri "veri yok"', () => {
  assert.equal(judgeRatio([1, 1.01, 0.99, 1]).status, OK);
  const a = judgeRatio([1.2, 1.2, 1.19, 1.21]); assert.equal(a.status, WARN); assert.equal(a.kind, 'x1.2');
  const b = judgeRatio([1 / 1.2, 0.83, 0.84]); assert.equal(b.status, WARN); assert.equal(b.kind, 'x0.83');
  assert.equal(judgeRatio([1, 1]).status, NONE);
  // Ortanca 1 ama dağınık: şüpheli
  assert.equal(judgeRatio([1, 1, 1, 1.5, 0.6, 1.4, 0.5]).status, WARN);
});

test('Hepsiburada komisyonu: hakediş Commission = satır komisyonu (API × 1,20) → ✓; hakediş KDV hariç (÷1,20) → ⚠ oran 0,83', async () => {
  for (const [vat, want, kind] of [[1, OK, 'equal'], [1 / 1.2, WARN, 'x0.83']]) {
    const db = await fresh();
    for (let i = 1; i <= 4; i++) {
      // Satır komisyonu panelde KDV dahil saklanır: 1000 TL × %15 × 1,20 = 180
      await order(db, 'hepsiburada', 'H' + i, { lines: [{ total: 1000, commission: 180 }] });
      await stl(db, 'hepsiburada', 'H' + i, 'Satış', 1000);
      await stl(db, 'hepsiburada', 'H' + i, 'Komisyon', -180 * vat, 180 * vat, { raw: 'Commission' });
    }
    const c = byId(await runChecks(db, SET, { chans: [HB], now: NOW }), 'hb_commission_vat');
    assert.equal(c.status, want, c.summary); assert.equal(c.tech.judge.kind, kind); assert.equal(c.tech.basis, 'api');
    if (want === WARN) assert.match(c.summary, /~%17 DÜŞÜK/);
  }
});

test('Hepsiburada komisyonu: iade / düzeltme kaydı olan sipariş karşılaştırılmaz; satırda komisyon yoksa tahminle; API örneği amount ÷ netAmount', async () => {
  const db = await fresh();
  for (let i = 1; i <= 3; i++) {
    await order(db, 'hepsiburada', 'T' + i, { lines: [{ total: 1000 }] }); // komisyon yok → Ayarlar %18
    await stl(db, 'hepsiburada', 'T' + i, 'Komisyon', -180, 180, { raw: 'Commission' });
  }
  await order(db, 'hepsiburada', 'R1', { lines: [{ total: 1000, commission: 180 }] });
  await stl(db, 'hepsiburada', 'R1', 'Komisyon', -999, 999, { raw: 'Commission' });
  await stl(db, 'hepsiburada', 'R1', 'Komisyon', 100, -100, { raw: 'CommissionRefund' });
  let c = byId(await runChecks(db, SET, { chans: [HB], now: NOW }), 'hb_commission_vat');
  assert.equal(c.tech.basis, 'estimate'); assert.equal(c.status, OK); assert.equal(c.tech.judge.n, 3);
  assert.match(c.summary, /tahminiyle/);
  // Hepsiburada kaydı: amount = netAmount (KDV ayrı) → tutar KDV hariç okunuyor: ⚠
  const probes = new Map([['hepsiburada', { commission: { records: 3, grossToNet: [1, 1, 1], taxToNet: [0.2, 0.2, 0.2] } }]]);
  c = byId(await runChecks(db, SET, { chans: [HB], now: NOW, probes }), 'hb_commission_vat');
  assert.equal(c.status, WARN); assert.match(c.summary, /KDV HARİÇ/);
  // Hakediş verisi yokken API örneği tek başına ✓ verir
  const empty = await fresh();
  c = byId(await runChecks(empty, SET, { chans: [HB], now: NOW, probes: new Map([['hepsiburada', { commission: { records: 2, grossToNet: [1.2, 1.2], taxToNet: [0.2, 0.2] } }]]) }), 'hb_commission_vat');
  assert.equal(c.status, OK); assert.match(c.summary, /KDV dahil/);
  c = byId(await runChecks(empty, SET, { chans: [HB], now: NOW }), 'hb_commission_vat');
  assert.equal(c.status, NONE);
});

test('Trendyol komisyonu: Satış + İndirim komisyonu = satır komisyonu → ✓; 1,20 katı → ⚠; satış tutarı indirimle tutar', async () => {
  for (const [k, want] of [[1, OK], [1.2, WARN]]) {
    const db = await fresh();
    for (let i = 1; i <= 4; i++) {
      // Brüt 1100, satıcı indirimi 100 → panel tutarı 1000, oran %20 → 200
      await order(db, 'trendyol', 'Y' + i, { lines: [{ total: 1000, commission: 200 }] });
      await stl(db, 'trendyol', 'Y' + i, 'Satış', 1100 - 220 * k, 220 * k);
      await stl(db, 'trendyol', 'Y' + i, 'İndirim', -(100 - 20 * k), -20 * k);
    }
    const cs = await runChecks(db, SET, { chans: [TY], now: NOW });
    const c = byId(cs, 'ty_commission');
    assert.equal(c.status, want, c.summary);
    if (want === WARN) assert.match(c.summary, /~%20 YÜKSEK/);
    // Satış tutarı: (Satış + indirim) = 1000 = panel
    assert.equal(byId(cs, 'sales_vs_settlement').status, OK);
  }
});

test('Satış tutarı: panel indirim öncesi (brüt) tutarı tutuyorsa ⚠ "satıcı indirimi düşülmüyor"', async () => {
  const db = await fresh();
  for (let i = 1; i <= 4; i++) {
    await order(db, 'trendyol', 'G' + i, { lines: [{ total: 1100, commission: 220 }] });
    await stl(db, 'trendyol', 'G' + i, 'Satış', 880, 220);
    await stl(db, 'trendyol', 'G' + i, 'Kupon', -80, -20);
  }
  const c = byId(await runChecks(db, SET, { chans: [TY], now: NOW }), 'sales_vs_settlement');
  assert.equal(c.status, WARN); assert.match(c.summary, /indiriminden ÖNCEKİ/); assert.equal(c.tech.gross, 4);
});

test('İade kargosu: faturada bulunan → ✓; iade var, gönderim faturası var ama iade kalemi yok → ⚠; iade yok → —', async () => {
  const mk = async (retSrc) => {
    const db = await fresh();
    await setSetting(db, 'costs:trendyol', { at: NOW - 3600e3, orders: 5, found: 5, split: 1 });
    for (let i = 1; i <= 4; i++) await order(db, 'trendyol', 'I' + i, { status: 'returned', at: NOW - 30 * D, lines: [{ total: 100, status: 'returned' }], ship: 'api', ret: retSrc });
    return db;
  };
  let c = byId(await runChecks(await mk('api'), SET, { chans: [TY], now: NOW }), 'return_cargo');
  assert.equal(c.status, OK, c.summary);
  c = byId(await runChecks(await mk(null), SET, { chans: [TY], now: NOW, probes: new Map([['trendyol', { cargo: { items: 10, types: { 'Gönderi Kargo Bedeli': 10 }, returnItems: 0 } }]]) }), 'return_cargo');
  assert.equal(c.status, WARN); assert.match(c.summary, /ayırt edilemiyor/); assert.match(c.summary, /Son kargo faturasında da/);
  assert.ok(c.numbers.some(([k, v]) => /kalem türleri/.test(k) && /Gönderi Kargo Bedeli: 10/.test(v)));
  const db = await fresh();
  await setSetting(db, 'costs:trendyol', { at: NOW, split: 1 });
  c = byId(await runChecks(db, SET, { chans: [TY], now: NOW }), 'return_cargo');
  assert.equal(c.status, NONE);
  // Okuma hatası: ⚠
  await setSetting(db, 'costs:trendyol', { at: NOW, error: 'HTTP 401' });
  assert.equal(byId(await runChecks(db, SET, { chans: [TY], now: NOW }), 'return_cargo').status, WARN);
});

test('Kargo faturası eşleşmesi: kargolananların çoğu faturadan → ✓, azı → ⚠', async () => {
  for (const [api, want] of [[4, OK], [1, WARN]]) {
    const db = await fresh();
    await setSetting(db, 'costs:hepsiburada', { at: NOW, split: 1 });
    for (let i = 1; i <= 5; i++) await order(db, 'hepsiburada', 'K' + i, { at: NOW - 30 * D, lines: [{ total: 100 }], ship: i <= api ? 'api' : null });
    assert.equal(byId(await runChecks(db, SET, { chans: [HB], now: NOW }), 'cargo_match').status, want);
  }
});

test('Hakediş ödendi bilgisi: vadesi geçmiş ödenmemiş kayıt → ⚠; hepsi ödendi → ✓; tanınmayan tür → ⚠', async () => {
  const db = await fresh();
  await stl(db, 'hepsiburada', 'P1', 'Satış', 100, 0, { paid: 1 });
  let cs = await runChecks(db, SET, { chans: [HB], now: NOW });
  assert.equal(byId(cs, 'settlement_paid').status, OK);
  assert.equal(byId(cs, 'settlement_types').status, OK);
  await stl(db, 'hepsiburada', 'P2', 'Satış', 250, 0, { paid: 0, due: NOW - 20 * D });
  await stl(db, 'hepsiburada', 'P3', 'Diğer', -12, 0, { raw: 'RoadAssistanceExpense' });
  cs = await runChecks(db, SET, { chans: [HB], now: NOW });
  const p = byId(cs, 'settlement_paid');
  assert.equal(p.status, WARN); assert.match(p.summary, /ödenmedi/); assert.equal(p.tech.late, 1);
  const t = byId(cs, 'settlement_types');
  assert.equal(t.status, WARN); assert.match(t.summary, /RoadAssistanceExpense/);
  assert.equal(byId(await runChecks(await fresh(), SET, { chans: [HB], now: NOW }), 'settlement_paid').status, NONE);
});

test('İlan durumları: tümü onay bekliyor → ⚠ (durum alanı yanlış okunuyor olabilir); sütun yoksa kontrol atlanır', async () => {
  const db = await fresh();
  for (let i = 1; i <= 6; i++) await run(db, "INSERT INTO listings (channel, remote_id, name, remote_state) VALUES ('idefix', ?, 'x', 'pending')", 'L' + i);
  await run(db, "INSERT INTO listings (channel, remote_id, name) VALUES ('trendyol', 'T1', 'x')");
  const names = (id) => id;
  let [c] = await listingStateCheck(db, names);
  assert.equal(c.status, WARN); assert.match(c.summary, /idefix/);
  await run(db, "UPDATE listings SET remote_state = NULL WHERE remote_id IN ('L1', 'L2', 'L3')");
  [c] = await listingStateCheck(db, names);
  assert.equal(c.status, OK);
  // Eski şema (remote_state yok): boş liste
  const fake = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [{ name: 'channel' }, { name: 'remote_id' }] }) }) }) };
  assert.deepEqual(await listingStateCheck(fake, names), []);
});

test('Resmî listeyle sağlama: ilan oranı liste × 1,20 (KDV iki kez) → ⚠; liste üstü oran → ⚠; uyumlu → ✓', async () => {
  const ins = (db, ch, id, cat, rate) => run(db, "INSERT INTO listings (channel, remote_id, name, mp_category, commission, commission_src) VALUES (?, ?, ?, ?, ?, 'api')", ch, id, id, cat, rate);
  let db = await fresh();
  for (let i = 1; i <= 3; i++) await ins(db, 'trendyol', 'A' + i, 'Saat Kordonu', 21.5);
  let c = byId(await runChecks(db, SET, { chans: [], now: NOW }), 'commission_list');
  assert.equal(c.status, OK, c.summary);
  db = await fresh();
  for (let i = 1; i <= 3; i++) await ins(db, 'hepsiburada', 'H' + i, 'Gram Altın', 7.2 * 1.2);
  c = byId(await runChecks(db, SET, { chans: [], now: NOW }), 'commission_list');
  assert.equal(c.status, WARN); assert.match(c.summary, /KDV kalıbı/);
  db = await fresh();
  await ins(db, 'trendyol', 'A1', 'Saat Kordonu', 21.5); await ins(db, 'trendyol', 'A2', 'Saat Kordonu', 21.5); await ins(db, 'trendyol', 'A3', 'Saat Kordonu', 25);
  c = byId(await runChecks(db, SET, { chans: [], now: NOW }), 'commission_list');
  assert.equal(c.status, WARN); assert.match(c.summary, /resmî listeden/);
});

test('Döviz, gönderim hataları, senkron tazeliği', async () => {
  const db = await fresh();
  let cs = await runChecks(db, SET, { chans: [TY], now: NOW });
  assert.equal(byId(cs, 'fx_orders').status, NONE);
  assert.equal(byId(cs, 'sync_fresh').status, WARN, 'sipariş hiç alınmadı');
  await setSetting(db, 'last:trendyol', { at: NOW - 600e3, ok: true, ordersAt: NOW - 600e3 });
  await run(db, "INSERT INTO orders (id, channel, remote_id, order_number, status, ordered_at, total, currency, extra) VALUES ('etsy:1', 'etsy', '1', '1', 'new', ?, 10, 'TRY', ?)", NOW - D, JSON.stringify({ fx: { currency: 'USD', rate: 40, total: 0.25 } }));
  await run(db, "INSERT INTO push_checks (channel, kind, ref, at, n, status, failed) VALUES ('trendyol', 'stock', 'r1', ?, 100, 'done', 1)", NOW - D);
  cs = await runChecks(db, SET, { chans: [TY], now: NOW });
  assert.equal(byId(cs, 'fx_orders').status, OK);
  assert.equal(byId(cs, 'sync_fresh').status, OK);
  assert.equal(byId(cs, 'push_errors').status, OK);
  await run(db, "INSERT INTO orders (id, channel, remote_id, order_number, status, ordered_at, total, currency) VALUES ('etsy:2', 'etsy', '2', '2', 'new', ?, 10, 'USD')", NOW - D);
  await run(db, "INSERT INTO push_checks (channel, kind, ref, at, n, status, failed) VALUES ('trendyol', 'stock', 'r2', ?, 100, 'done', 30)", NOW - D);
  await setSetting(db, 'stlsync:trendyol', { at: NOW, error: 'HTTP 500' });
  cs = await runChecks(db, SET, { chans: [TY], now: NOW });
  assert.equal(byId(cs, 'fx_orders').status, WARN);
  assert.equal(byId(cs, 'push_errors').status, WARN);
  const s = byId(cs, 'sync_fresh'); assert.equal(s.status, WARN); assert.match(s.summary, /hakediş: HTTP 500/);
});

test('Rapor: 1 saat önbellek, force yeniler; destek özeti şüphelileri önce ve teknik ayrıntıyla verir', async () => {
  const db = await fresh();
  await stl(db, 'hepsiburada', 'P2', 'Satış', 250, 0, { paid: 0, due: NOW - 20 * D });
  const r1 = await healthReport({}, db, SET, { chans: [HB], now: NOW });
  assert.equal(r1.cached, false); assert.ok(r1.summary.warn >= 1);
  const r2 = await healthReport({}, db, SET, { chans: [HB], now: NOW + 600e3 });
  assert.equal(r2.cached, true); assert.equal(r2.at, NOW);
  const r3 = await healthReport({}, db, SET, { chans: [HB], now: NOW + 600e3, force: true });
  assert.equal(r3.cached, false); assert.equal(r3.at, NOW + 600e3);
  const t = ticketText(r3);
  assert.match(t.subject, /şüpheli bulgu/);
  assert.ok(t.body.indexOf('[⚠]') < t.body.indexOf('[—]'), 'şüpheliler önce');
  assert.match(t.body, /tech: \{/);
  assert.ok(t.body.length <= 6000);
});

test('Yetki: Gelir/gider yetkisi olmayan personel 403; yönetici rapor alır', async () => {
  resetChannels();
  const db = await fresh(), env = { PANEL_PASSWORD: 'x' };
  const req = () => new Request('https://panel.test/api/health/data');
  await assert.rejects(api(req(), env, { waitUntil() {} }, db, 'health/data', { id: 5, name: 'Depo', role: 'staff', perms: ['orders', 'stock'] }), /yetki/i);
  const r = await api(req(), env, { waitUntil() {} }, db, 'health/data', { id: 6, name: 'Muhasebe', role: 'staff', perms: ['finance:view'] });
  const j = await r.json();
  assert.ok(Array.isArray(j.checks)); assert.ok(j.ticket && j.ticket.subject);
});

test('Kanal örnekleri: Trendyol kargo faturası kalem türleri ve komisyon ÷ (satış × oran); Hepsiburada amount ÷ netAmount', async () => {
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      const u = String(url);
      const body = /otherfinancials/.test(u) ? { content: [{ id: 'KF1', transactionType: 'Kargo Faturası', transactionDate: NOW }], totalPages: 1 }
        : /cargo-invoice\/KF1\/items/.test(u) ? { content: [{ shipmentPackageType: 'Gönderi Kargo Bedeli', orderNumber: '1', amount: 34.24, desi: 1, parcelUniqueId: 7 }, { shipmentPackageType: 'İade Kargo Bedeli', orderNumber: '2', amount: 34.24, desi: 1, parcelUniqueId: 8 }] }
          : /settlements/.test(u) ? { content: [{ id: 1, transactionType: 'Satış', credit: 500, debt: 0, commissionRate: 20, commissionAmount: 100, sellerRevenue: 400 }] } : {};
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const ty = await trendyol({ TRENDYOL_SELLER_ID: '1', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' }, { id: 'trendyol' }).financeProbe(NOW);
    assert.deepEqual(ty.cargo.types, { 'Gönderi Kargo Bedeli': 1, 'İade Kargo Bedeli': 1 });
    assert.equal(ty.cargo.returnItems, 1);
    assert.deepEqual(ty.sale.ratios, [1]);
    globalThis.fetch = async (url) => {
      const u = String(url);
      const items = /TransactionTypes=Commission/.test(u) ? [{ id: 'c1', transactionType: 'Commission', amount: { value: -120, currencyCode: 'TRY' }, taxAmount: { value: -20 }, netAmount: { value: -100 } }]
        : [{ id: 'x', transactionType: 'ReturnShipmentCostSharingExpense', amount: { value: -30 } }, { id: 'y', transactionType: 'Payment', amount: { value: 500 } }];
      return new Response(JSON.stringify({ count: items.length, items }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const hb = await hepsiburada({ HB_MERCHANT_ID: 'M', HB_PASSWORD: 'p', HB_USER_AGENT: 'hasturk_dev' }, { id: 'hepsiburada' }).financeProbe(NOW);
    assert.deepEqual(hb.commission.grossToNet, [1.2]); assert.deepEqual(hb.commission.taxToNet, [0.2]);
    assert.deepEqual(hb.types.types, { ReturnShipmentCostSharingExpense: 1, Payment: 1 });
  } finally { globalThis.fetch = realFetch; }
});
