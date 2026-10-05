// Firma logosu: herkese açık logo adresi (e-postalar için) ve e-postalardaki logo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, setSetting } from '../src/db.js';
import worker from '../src/index.js';
import { logoUrl, orderMail } from '../src/mail.js';
import { digestMail } from '../src/digest.js';

const PNG = 'data:image/png;base64,' + btoa(String.fromCharCode(137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3));

test('logo adresi: oturumsuz görsel döner; logo yoksa 404', async () => {
  const db = d1();
  await init(db);
  const env = { PANEL_PASSWORD: 'x-123456', DB: db };
  const get = () => worker.fetch(new Request('https://panel.test/api/logo?v=1'), env, { waitUntil() {} });
  assert.equal((await get()).status, 404);
  await setSetting(db, 'logo', PNG);
  const r = await get();
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())].slice(0, 4), [137, 80, 78, 71]);
});

test('e-postalarda logo: panel adresi ve logo varsa görünür; müşteri panelinde firma koduyla', () => {
  assert.equal(logoUrl({}, { logo: PNG }), '', 'panel adresi yoksa logo yok');
  const u = logoUrl({}, { logo: PNG, panel_url: 'https://panel.test/' });
  assert.match(u, /^https:\/\/panel\.test\/api\/logo\?v=/);
  assert.match(logoUrl({ TENANT_SLUG: 'acme' }, { logo: PNG, panel_url: 'https://panel.test' }), /\/api\/logo\?t=acme&v=/);
  const o = { id: '1', order_number: '9', ordered_at: Date.now(), total: 10, address: '{}' };
  assert.match(orderMail(o, [], { id: 'trendyol', name: 'Trendyol', type: 'trendyol' }, 'https://panel.test', u).html, /<img src="https:\/\/panel\.test\/api\/logo/);
  const d = { day: 'Pazartesi', names: {}, total: { revenue: 0, orders: 0, profit: 0 }, prev: {}, channels: [], toShip: 0, late: 0, questions: 0, claims: 0, outOfStock: 0, runout: [] };
  assert.match(digestMail(d, { company: 'Acme', logo: u }).html, /<img src="https:\/\/panel\.test\/api\/logo[^"]*" alt="Acme"/);
  assert.doesNotMatch(digestMail(d, { company: 'Acme' }).html, /<img/);
});
