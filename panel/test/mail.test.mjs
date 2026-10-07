// Yeni sipariş e-posta bildirimi: yalnızca yeni siparişler, sipariş başına tek e-posta, kapalıyken gönderim yok.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, setSetting, getSettings, first } from '../src/db.js';
import { saveOrders } from '../src/sync.js';
import { queueNew, sendQueued, orderMail, mailTitle } from '../src/mail.js';
import { saveConfig } from '../src/config.js';

const order = (id, at = Date.now()) => ({
  remoteId: id, orderNumber: id, orderedAt: at, status: 'new', remoteStatus: 'Created', customer: 'Ayşe K', address: { city: 'İzmir', district: 'Bornova' }, total: 300,
  items: [{ lineId: id + '-1', sku: 'A', barcode: '111', name: 'Gübre 5 kg', quantity: 2, unitPrice: 150, total: 300, status: '', remoteKey: '111' }], packages: null,
});
const TY = { id: 'trendyol', name: 'Trendyol', type: 'trendyol' };
const IK = { id: 'ikas1', name: 'HasTürk', type: 'ikas' };

test('yeni sipariş e-postası: yalnızca yeni siparişe bir kez, ikas/pazaryeri başlığıyla, panel bağlantısıyla', async () => {
  const db = d1();
  await init(db);
  const env = { PANEL_PASSWORD: 'x' };
  await saveConfig(env, db, 'mail', { values: { MAIL_PROVIDER: 'brevo', MAIL_API_KEY: 'k-123', MAIL_FROM: 'bildirim@firma.com', MAIL_FROM_NAME: 'Panel' } });
  await setSetting(db, 'mail_enabled', true);
  await setSetting(db, 'mail_to', ['sahip@firma.com']);
  await setSetting(db, 'panel_url', 'https://panel.ornek.dev');
  const sent = [];
  globalThis.fetch = async (url, opts) => { sent.push({ url: String(url), headers: opts.headers, body: JSON.parse(opts.body) }); return new Response('{"messageId":"m1"}', { status: 201, headers: { 'Content-Type': 'application/json' } }); };

  // Yeni sipariş → kuyruğa bir kez
  const ids = await saveOrders(db, 'trendyol', [order('T1')]);
  assert.deepEqual(ids.created, ['trendyol:T1']);
  let st = await getSettings(db);
  assert.equal(await queueNew(db, TY, ids.created, st), 1);
  assert.equal(await sendQueued(env, db, [TY], st), 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(sent[0].headers['api-key'], 'k-123');
  assert.deepEqual(sent[0].body.to, [{ email: 'sahip@firma.com' }]);
  assert.match(sent[0].body.subject, /^Trendyol üzerinden yeni sipariş geldi · #T1/);
  assert.match(sent[0].body.htmlContent, /https:\/\/panel\.ornek\.dev\/#\/siparisler\/trendyol%3AT1/);
  assert.match(sent[0].body.htmlContent, /Gübre 5 kg/);

  // Aynı sipariş tekrar senkronda gelir (değişse de) → yeni sayılmaz, e-posta gitmez
  const again = await saveOrders(db, 'trendyol', [{ ...order('T1'), status: 'processing', remoteStatus: 'Picking' }]);
  assert.deepEqual(again.created, []);
  assert.equal(await queueNew(db, TY, ['trendyol:T1'], st), 1, 'kuyruğa yazmayı denese bile');
  assert.equal(await sendQueued(env, db, [TY], st), 0, 'aynı sipariş için ikinci e-posta gitmez');
  assert.equal(sent.length, 1);

  // 48 saatten eski sipariş (geç gelen eski kayıt) → e-posta yok
  const old = await saveOrders(db, 'trendyol', [order('T0', Date.now() - 5 * 864e5)]);
  assert.equal(await queueNew(db, TY, old.created, st), 0);

  // Kanal seçimi kapalı → e-posta yok; ikas başlığı
  await setSetting(db, 'mail_channels', { trendyol: false });
  st = await getSettings(db);
  const t2 = await saveOrders(db, 'trendyol', [order('T2')]);
  assert.equal(await queueNew(db, TY, t2.created, st), 0);
  const i1 = await saveOrders(db, 'ikas1', [order('1001')]);
  assert.equal(await queueNew(db, IK, i1.created, st), 1);
  await sendQueued(env, db, [IK], st);
  assert.match(sent[1].body.subject, /^HasTürk \(ikas\) mağazanızdan yeni sipariş geldi/);

  // Bildirim kapalı → kuyruğa girmez; servis hatası → tekrar denenir ve bildirim oluşur
  await setSetting(db, 'mail_enabled', false);
  st = await getSettings(db);
  const i2 = await saveOrders(db, 'ikas1', [order('1002')]);
  assert.equal(await queueNew(db, IK, i2.created, st), 0);
  await setSetting(db, 'mail_enabled', true);
  st = await getSettings(db);
  const i3 = await saveOrders(db, 'ikas1', [order('1003')]);
  await queueNew(db, IK, i3.created, st);
  globalThis.fetch = async () => new Response('{"message":"Key not found"}', { status: 401, headers: { 'Content-Type': 'application/json' } });
  assert.equal(await sendQueued(env, db, [IK], st), 0);
  const q = await first(db, "SELECT tries, sent_at, error FROM mail_queue WHERE order_id = 'ikas1:1003'");
  assert.equal(q.tries, 1); assert.equal(q.sent_at, null); assert.match(q.error, /401/);
  assert.ok(await first(db, "SELECT 1 AS x FROM notices WHERE key = 'mail' AND resolved_at IS NULL"));
});

test('e-posta içeriği: sipariş no, tarih, ürünler, adet, toplam; iptal satırlar hariç', () => {
  const m = orderMail({ id: 'hepsiburada:55', order_number: '55', ordered_at: Date.parse('2026-10-03T09:30:00Z'), customer: 'Can', address: '{"city":"Bursa"}', total: 120 },
    [{ name: 'A', sku: 'SA', quantity: 3, total: 120, status: '' }, { name: 'İptal ürün', quantity: 1, total: 10, status: 'cancelled' }], { id: 'hepsiburada', name: 'Hepsiburada', type: 'hepsiburada' }, 'https://p.dev/');
  assert.equal(mailTitle({ name: 'Hepsiburada', type: 'hepsiburada' }), 'Hepsiburada üzerinden yeni sipariş geldi');
  assert.match(m.text, /Sipariş no: #55/);
  assert.match(m.text, /3 × A/);
  assert.doesNotMatch(m.text, /İptal ürün/);
  assert.match(m.text, /Toplam: ₺120,00/);
  assert.match(m.text, /03\.10\.2026|3 Eki 2026/);
  assert.match(m.html, /href="https:\/\/p\.dev\/#\/siparisler\/hepsiburada%3A55"/);
});

test('e-posta: kargo farkı ara toplamla gösterilir; birden çok alıcıya ayrı kopya (Brevo messageVersions)', async () => {
  const m = orderMail({ id: 'ikas1:9', order_number: '9', ordered_at: Date.now(), customer: 'Emir', address: '{"city":"İstanbul","district":"Avcılar"}', total: 694 },
    [{ name: 'Toprak', sku: 'HG-1', quantity: 1, unit_price: 549, total: 549, status: '' }], IK, 'https://p.dev', '', 'HasTürk Gübre');
  assert.match(m.html, /Ara toplam/); assert.match(m.html, /Kargo ve diğer ücretler/); assert.match(m.html, /₺145,00/);
  assert.match(m.text, /Kargo ve diğer ücretler: ₺145,00/);
  assert.match(m.html, /color-scheme/);
  const db = d1();
  await init(db);
  const env = { PANEL_PASSWORD: 'x' };
  await saveConfig(env, db, 'mail', { values: { MAIL_PROVIDER: 'brevo', MAIL_API_KEY: 'k', MAIL_FROM: 'bildirim@firma.com' } });
  const sent = [];
  globalThis.fetch = async (url, opts) => { sent.push(JSON.parse(opts.body)); return new Response('{}', { status: 201, headers: { 'Content-Type': 'application/json' } }); };
  const { sendMail } = await import('../src/mail.js');
  await sendMail(env, db, { to: ['a@x.com', 'b@x.com'], ...m });
  assert.equal(sent[0].to, undefined);
  assert.deepEqual(sent[0].messageVersions, [{ to: [{ email: 'a@x.com' }] }, { to: [{ email: 'b@x.com' }] }]);
});
