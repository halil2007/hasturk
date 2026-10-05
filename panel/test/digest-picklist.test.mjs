// Toplama listesi ve günlük özet e-postası.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, setSetting, getRaw, getSettings } from '../src/db.js';
import { pickList } from '../src/picklist.js';
import { digestData, digestMail, dailyDigest } from '../src/digest.js';

const t = Date.now(), D = 864e5;
async function seed() {
  const db = d1();
  await init(db);
  for (const [id, name, stock, variant] of [[1, 'Solucan Gübresi', 3, '5 Kg'], [2, 'Torf', 50, null]]) await run(db, 'INSERT INTO products (id, name, group_name, variant_name, sku, stock, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, variant ? `${name} ${variant}` : name, name, variant, 'S' + id, stock, t, t);
  const O = async (id, status, ago, lines) => {
    await run(db, "INSERT INTO orders (id, channel, remote_id, order_number, status, ordered_at, total) VALUES (?, 'trendyol', ?, ?, ?, ?, ?)", id, id, 'N' + id, status, t - ago, lines.reduce((s, l) => s + l[2] * 100, 0));
    for (const [line, pid, qty, st = ''] of lines) await run(db, 'INSERT INTO order_items (order_id, line_id, product_id, sku, name, quantity, total, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, line, pid, 'S' + pid, 'x', qty, qty * 100, st);
  };
  await O('a', 'new', 2 * 3600e3, [['a1', 1, 2], ['a2', 2, 1], ['a3', 2, 5, 'cancelled']]);
  await O('b', 'processing', 3600e3, [['b1', 1, 3], ['b2', 2, 4]]);
  await O('c', 'shipped', D, [['c1', 1, 9]]);
  // b paketlenmiş: b1 açık pakette, b2 gönderilmiş pakette
  await run(db, "INSERT INTO packages (order_id, no, items, status, created_at) VALUES ('b', 1, ?, 'open', ?), ('b', 2, ?, 'shipped', ?)", JSON.stringify([{ line_id: 'b1', qty: 3 }]), t, JSON.stringify([{ line_id: 'b2', qty: 4 }]), t);
  return db;
}

test('toplama listesi: kargoya çıkacak adetler ürün bazında toplanır', async () => {
  const db = await seed();
  const r = await pickList(db, {});
  assert.equal(r.orders, 2);
  const by = Object.fromEntries(r.items.map((x) => [x.product_id, x]));
  assert.equal(by[1].qty, 5, 'a:2 + b açık paket:3');
  assert.equal(by[1].variant, '5 Kg');
  assert.equal(by[1].stock, 3);
  assert.equal(by[2].qty, 1, 'iptal satır ve gönderilmiş paket sayılmaz');
  assert.equal(r.totalQty, 6);
  assert.deepEqual(Object.fromEntries((await pickList(db, { ids: ['a'] })).items.map((x) => [x.product_id, x.qty])), { 1: 2, 2: 1 }, 'seçili sipariş');
  assert.equal((await pickList(db, { ids: 'a' })).totalQty, 3);
  assert.equal((await pickList(db, { channel: 'n11' })).items.length, 0);
});

test('günlük özet: veri, e-posta metni ve günde bir gönderim', async () => {
  const db = await seed();
  const settings = await getSettings(db);
  const d = await digestData({}, db, settings);
  assert.equal(d.toShip, 2);
  const m = digestMail(d, { company: 'Hastürk', panelUrl: 'https://panel.test' });
  assert.match(m.subject, /^Günlük özet · \d{1,2} \S+ \d{4} /);
  assert.match(m.html, /kargoya hazırlanacak/);
  assert.match(m.html, /https:\/\/panel\.test\/#\/kargo/);
  // Kapalıyken gönderilmez; açıkken alıcı yoksa hata verir
  assert.equal(await dailyDigest({}, db, { ...settings, daily_digest: false }), null);
  await assert.rejects(() => dailyDigest({}, db, { ...settings, daily_digest: true, mail_to: [] }, { force: true }), /alıcı/);
  // Bugün gönderildiyse tekrar gönderilmez
  await setSetting(db, 'digest_sent', new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10));
  assert.equal(await dailyDigest({}, db, { ...settings, daily_digest: true, mail_to: ['a@b.co'] }), null);
});
