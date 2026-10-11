// Yurt dışı pazaryerleri yalnız Kurumsal pakette: eBay / Etsy / Ozon ve Türkiye dışı Amazon bağlanamaz; Amazon.com.tr serbest
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import { api } from '../src/api.js';
import { isIntl } from '../src/config.js';
import { resetChannels } from '../src/channels/index.js';

const ADMIN = { id: 1, name: 'Yönetici', role: 'admin', perms: null };
const put = (env, db, id, values) => api(new Request('https://p.test/api/integrations/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values }) }), env, { waitUntil() {} }, db, 'integrations/' + id, ADMIN);
const env = (plan) => ({ PANEL_PASSWORD: 'x', PANEL_SECRET: 's'.repeat(32), TENANT_SLUG: 'firma', TENANT_PLAN: plan });

test('isIntl: eBay/Etsy/Ozon her zaman, Amazon yalnız Türkiye dışı pazar yerinde', () => {
  assert.equal(isIntl('ebay'), true); assert.equal(isIntl('etsy'), true); assert.equal(isIntl('ozon'), true);
  assert.equal(isIntl('trendyol'), false);
  assert.equal(isIntl('amazon', { AMAZON_SELLER_ID: 'A1' }), false);
  assert.equal(isIntl('amazon', { AMAZON_MARKETPLACE_ID: 'A33AVAJ2PDY3EV' }), false);
  assert.equal(isIntl('amazon', { AMAZON_MARKETPLACE_ID: 'ATVPDKIKX0DER' }), true);
  assert.equal(isIntl('amazon', { AMAZON_REGION: 'na' }), true);
});

test('Profesyonel pakette yurt dışı pazaryeri bağlanamaz; Kurumsal pakette bağlanır', async () => {
  resetChannels();
  const db = d1(); await init(db);
  await assert.rejects(() => put(env('profesyonel'), db, 'ebay', { EBAY_CLIENT_ID: 'x' }), (e) => e.status === 403 && /Kurumsal/.test(e.message));
  await assert.rejects(() => put(env('profesyonel'), db, 'amazon', { AMAZON_SELLER_ID: 'A1B2C3D4E5', AMAZON_MARKETPLACE_ID: 'ATVPDKIKX0DER' }), (e) => e.status === 403);
  const tr = await put(env('profesyonel'), db, 'amazon', { AMAZON_SELLER_ID: 'A1B2C3D4E5' });
  assert.equal(tr.status, 200, 'Amazon.com.tr yurt içi');
  resetChannels();
  const ok = await put(env('kurumsal'), db, 'ebay', { EBAY_CLIENT_ID: 'x' });
  assert.equal(ok.status, 200);
});
