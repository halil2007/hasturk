// Test aşamasındaki kanallar: ana ve müşteri panellerinde bekleyen (bağlantı testi bekleyen) kanal olarak listelenir, "beta" işaretli
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import { getChannels, resetChannels, publicInfo } from '../src/channels/index.js';
import { addStore, BETA_TYPES } from '../src/config.js';

test('ana panel: test modülü kanalları bekleyen ve "beta" işaretli', async () => {
  const db = d1(); await init(db); resetChannels();
  const chs = await getChannels({ PANEL_PASSWORD: 'x' }, db);
  for (const t of BETA_TYPES) {
    const c = chs.find((x) => x.id === t);
    assert.ok(c, t + ' listede');
    assert.equal(c.gated, true, t + ' bağlantı testi bekliyor');
    assert.equal(publicInfo(c).beta, true);
  }
});

test('müşteri paneli: test aşamasındaki kanallar listede ("beta"), eklenebilir', async () => {
  const db = d1(); await init(db); resetChannels();
  const chs = await getChannels({ PANEL_PASSWORD: 'x', TENANT_SLUG: 'firma' }, db);
  for (const t of BETA_TYPES) {
    const c = chs.find((x) => x.id === t);
    assert.ok(c, t + ' listede');
    assert.equal(c.gated, true, t + ' bağlantı testi bekliyor');
    assert.equal(publicInfo(c).beta, true);
  }
  assert.equal(await addStore(db, 'amazon'), 'amazon_2');
  resetChannels();
  const c2 = (await getChannels({ PANEL_PASSWORD: 'x', TENANT_SLUG: 'firma' }, db)).find((c) => c.id === 'amazon_2');
  assert.ok(c2);
  assert.equal(publicInfo(c2).beta, true);
});

test('"Test aşamasında" yazısı kaldırılan kanal: ana ve müşteri panelinde "beta" kalkar; site listesi', async () => {
  const db = d1(); await init(db); resetChannels();
  const { setSetting } = await import('../src/db.js');
  const { platformValues } = await import('../src/tenants.js');
  const worker = (await import('../src/index.js')).default;
  await setSetting(db, 'released_channels', ['shopify']);
  resetChannels();
  const main = await getChannels({ PANEL_PASSWORD: 'x' }, db);
  assert.equal(publicInfo(main.find((c) => c.id === 'shopify')).beta, false);
  assert.equal(publicInfo(main.find((c) => c.id === 'amazon')).beta, true);
  // Müşteri paneline ana panelin listesi ortam değişkeniyle gider
  const pv = await platformValues({}, db);
  assert.equal(pv.RELEASED_TYPES, 'shopify');
  const tdb = d1(); await init(tdb); resetChannels();
  const tenv = { PANEL_PASSWORD: 'x', TENANT_SLUG: 'firma', RELEASED_TYPES: pv.RELEASED_TYPES };
  const tch = await getChannels(tenv, tdb);
  assert.equal(publicInfo(tch.find((c) => c.id === 'shopify')).beta, false);
  assert.equal(publicInfo(tch.find((c) => c.id === 'amazon')).beta, true);
  const r = await worker.fetch(new Request('https://panel.test/api/public/channels', { headers: { Origin: 'https://hasturkcrm.com' } }), { DB: db }, { waitUntil() {} });
  const d = await r.json();
  assert.deepEqual(d.released, ['shopify']);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://hasturkcrm.com');
});
