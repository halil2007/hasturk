// Kanal HTML hata sayfası döndürünce (bakım, güvenlik duvarı) ham HTML yerine anlaşılır neden
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlReason, http } from '../src/util.js';

test('bakım sayfası, güvenlik duvarı ve düz metin', async () => {
  assert.match(htmlReason('<!DOCTYPE html><html lang="tr"><head><title>Bakımdayız | PTTAVM</title></head></html>', 503), /kanal bakımda \(“Bakımdayız \| PTTAVM”\)/);
  assert.match(htmlReason('<html><head><title>Attention Required! | Cloudflare</title>', 403), /güvenlik duvarı/);
  assert.equal(htmlReason('Geçersiz token', 401), 'Geçersiz token');
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response('<!DOCTYPE html><html><head><title>Bakımdayız | PTTAVM</title></head><body>…</body></html>', { status: 503, headers: { 'Content-Type': 'text/html' } });
  try { await assert.rejects(() => http('https://integration-api.pttavm.com/api/v1/orders/search', { tries: 1 }), (e) => /HTTP 503 kanal bakımda/.test(e.message) && !/DOCTYPE/.test(e.message)); }
  finally { globalThis.fetch = real; }
});
