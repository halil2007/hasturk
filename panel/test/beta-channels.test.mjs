// Test modülündeki kanallar: ana panelde bekleyen (bağlantı testi bekleyen) kanal olarak listelenir; müşteri panellerinde hiç yoktur
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

test('müşteri paneli: test modülü kanalları yok, eklenemez', async () => {
  const db = d1(); await init(db); resetChannels();
  const chs = await getChannels({ PANEL_PASSWORD: 'x', TENANT_SLUG: 'firma' }, db);
  assert.equal(chs.filter((c) => BETA_TYPES.includes(c.type)).length, 0);
  await assert.rejects(() => addStore(db, 'amazon', { tenant: true }), /yakında/);
  assert.equal(await addStore(db, 'amazon'), 'amazon_2');
  resetChannels();
  assert.ok(!(await getChannels({ PANEL_PASSWORD: 'x', TENANT_SLUG: 'firma' }, db)).some((c) => c.id === 'amazon_2'));
});
