// Panel arama motorlarına kapalıdır; tarayıcıların istediği /sitemap.xml tanıtım sitesinin haritasına yönlenir (404 vermez)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../src/index.js';

test('panel /sitemap.xml tanıtım sitesine 301; robots.txt her şeyi kapatır', async () => {
  const r = await handler.route(new Request('https://panel.hasturkcrm.com/sitemap.xml'), {}, { waitUntil() {} });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('Location'), 'https://hasturkcrm.com/sitemap.xml');
  const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8');
  assert.match(robots, /User-agent: \*\nDisallow: \/\n/);
  assert.match(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'), /"run_worker_first": \[[^\]]*"\/sitemap\.xml"/);
});
