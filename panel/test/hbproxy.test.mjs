// Hepsiburada aracı sunucusu (Deno Deploy sürümü): anahtar, adres kısıtı ve başlık/gövde iletimi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../public/hb-proxy-deno.js';

const KEY = 'k'.repeat(30);
const req = (u, init = {}) => new Request(`https://p.deno.dev/?u=${encodeURIComponent(u)}`, init);

test('hb-proxy-deno: anahtar ve adres kısıtı', async () => {
  const never = () => { throw new Error('iletilmemeli'); };
  assert.equal((await handle(req('https://oms-external-sit.hepsiburada.com/x'), 'BURAYA-UZUN-RASTGELE-BIR-ANAHTAR-YAZIN', never)).status, 500);
  assert.equal((await handle(req('https://oms-external-sit.hepsiburada.com/x', { headers: { 'X-Proxy-Key': 'yanlis' } }), KEY, never)).status, 403);
  for (const u of ['https://evil.com/x', 'http://oms-external.hepsiburada.com/x', 'https://hepsiburada.com.evil.com/x', 'yok'])
    assert.equal((await handle(req(u, { headers: { 'X-Proxy-Key': KEY } }), KEY, never)).status, 400, u);
});

test('hb-proxy-deno: başlıkları ve gövdeyi iletir, yanıtı aynen döner', async () => {
  let seen;
  const fake = async (url, o) => { seen = { url, ...o, text: o.body ? new TextDecoder().decode(o.body) : null }; return new Response('{"ok":1}', { status: 201, headers: { 'content-type': 'application/json' } }); };
  const r = await handle(req('https://oms-stub-external-sit.hepsiburada.com/orders/merchantId/M-1', {
    method: 'POST', body: '{"a":1}',
    headers: { 'X-Proxy-Key': KEY, Authorization: 'Basic abc', 'User-Agent': 'hasturk_dev', Accept: 'application/json', 'Content-Type': 'application/json', Cookie: 'x=1' },
  }), KEY, fake);
  assert.equal(r.status, 201);
  assert.equal(await r.text(), '{"ok":1}');
  assert.equal(seen.url, 'https://oms-stub-external-sit.hepsiburada.com/orders/merchantId/M-1');
  assert.equal(seen.method, 'POST');
  assert.equal(seen.text, '{"a":1}');
  assert.equal(seen.headers.get('authorization'), 'Basic abc');
  assert.equal(seen.headers.get('user-agent'), 'hasturk_dev');
  assert.equal(seen.headers.get('content-type'), 'application/json');
  assert.equal(seen.headers.get('cookie'), null);
  assert.equal(seen.headers.get('x-proxy-key'), null);
  // Çok parçalı form: gerçek içerik türü X-Content-Type ile gelir
  await handle(req('https://mpop-sit.hepsiburada.com/product/api/products/import', { method: 'POST', body: 'b', headers: { 'X-Proxy-Key': KEY, 'Content-Type': 'application/octet-stream', 'X-Content-Type': 'multipart/form-data; boundary=zz' } }), KEY, fake);
  assert.equal(seen.headers.get('content-type'), 'multipart/form-data; boundary=zz');
  // GET'te gövde yok
  await handle(req('https://oms-external-sit.hepsiburada.com/orders/merchantId/M-1?offset=0', { headers: { 'X-Proxy-Key': KEY } }), KEY, fake);
  assert.equal(seen.method, 'GET');
  assert.equal(seen.body, undefined);
});
