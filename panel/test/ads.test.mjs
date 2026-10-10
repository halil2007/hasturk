// Google Ads dönüşüm etiketleri: ana panel Ayarlar → Google Ads'ten girilir, tanıtım sitesi /api/public/ads ile okur
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import worker from '../src/index.js';

test('Google Ads etiketleri: kaydedilir (tam snippet de olur), geçersiz reddedilir, site herkese açık adresten okur', async () => {
  const env = { PANEL_PASSWORD: 'pw-123456', PANEL_SECRET: 's', DB: d1(), SITE_ORIGINS: 'https://hasturkcrm.com' };
  await init(env.DB);
  let cookie = '';
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(opts.headers || {}) } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return r;
  };
  await call('/api/login', { method: 'POST', body: JSON.stringify({ password: 'pw-123456' }) });
  let r = await call('/api/settings', { method: 'PUT', body: JSON.stringify({ ads_conv: { trial: 'AW-18503315802/AbC1dEfGh', lead: 'Lead_123x', purchase: '', eft: '' } }) });
  assert.equal(r.status, 200);
  assert.equal((await call('/api/settings', { method: 'PUT', body: JSON.stringify({ ads_conv: { trial: '<script>' } }) })).status, 400);
  r = await call('/api/public/ads', { headers: { Origin: 'https://hasturkcrm.com' } });
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://hasturkcrm.com');
  assert.deepEqual(await r.json(), { trial: 'AbC1dEfGh', lead: 'Lead_123x', purchase: '', eft: '' });
});
