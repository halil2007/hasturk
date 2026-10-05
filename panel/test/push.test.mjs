// Anlık bildirim: VAPID imzası doğrulanabilir, abonelere gövdesiz push gider, süresi dolan abonelik silinir, senkron özeti.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, all, run, setSetting, getRaw } from '../src/db.js';
import { publicKey, subscribe, notify, latest, pushDigest } from '../src/push.js';

const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

test('abonelik, VAPID imzalı gönderim, 410 temizliği ve son bildirim', async () => {
  const db = d1();
  await init(db);
  const key = await publicKey(db);
  assert.equal(unb64(key).length, 65, 'ham P-256 açık anahtar');
  assert.equal(await publicKey(db), key, 'anahtar bir kez üretilir');
  await subscribe(db, { id: 1 }, { endpoint: 'https://fcm.googleapis.com/fcm/send/abc' }, 'UA');
  await subscribe(db, { id: 1 }, { endpoint: 'https://web.push.apple.com/old' }, 'UA');
  await assert.rejects(() => subscribe(db, { id: 1 }, { endpoint: 'http://x' }), /Geçersiz/);
  const calls = [];
  const r = await notify(db, { title: 'T', body: 'B', url: '#/siparisler' }, { fetchFn: async (url, o) => { calls.push({ url, o }); return new Response('', { status: url.includes('old') ? 410 : 201 }); } });
  assert.equal(r.sent, 1);
  assert.equal((await all(db, 'SELECT endpoint FROM push_subs')).length, 1, 'süresi dolan abonelik silinir');
  const c = calls.find((x) => x.url.includes('fcm'));
  assert.equal(c.o.method, 'POST'); assert.equal(c.o.headers.TTL, '3600');
  const [, t, k] = /^vapid t=([^,]+), k=(.+)$/.exec(c.o.headers.Authorization);
  assert.equal(k, key);
  const [h, p, sig] = t.split('.');
  const payload = JSON.parse(new TextDecoder().decode(unb64(p)));
  assert.equal(payload.aud, 'https://fcm.googleapis.com');
  const pub = await crypto.subtle.importKey('raw', unb64(key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64(sig), new TextEncoder().encode(`${h}.${p}`)), 'JWT imzası açık anahtarla doğrulanır');
  assert.equal((await latest(db)).url, '#/siparisler');
});

test('senkron özeti: yeni sipariş / iade / soru varsa tek bildirim', async () => {
  const db = d1();
  await init(db);
  const realFetch = globalThis.fetch, sent = [];
  globalThis.fetch = async (url) => { sent.push(String(url)); return new Response('', { status: 201 }); };
  try {
    assert.equal(await pushDigest({}, db, { newOrders: 3 }), null, 'ilk çalıştırma yalnız zamanı kaydeder');
    await subscribe(db, { id: 1 }, { endpoint: 'https://fcm.googleapis.com/fcm/send/abc' });
    assert.equal(await pushDigest({}, db, {}), null, 'yeni bir şey yoksa bildirim yok');
    await setSetting(db, 'push_last_at', Date.now() - 60e3);
    await run(db, "INSERT INTO questions (channel, remote_id, text, status, asked_at) VALUES ('trendyol', 'q1', 'Stok var mı?', 'waiting', ?)", Date.now() - 1000);
    const r = await pushDigest({}, db, { newOrders: 2 });
    assert.equal(r.sent, 1);
    const m = await getRaw(db, 'push_latest');
    assert.equal(m.body, '2 yeni sipariş · 1 müşteri sorusu');
    assert.equal(m.url, '#/siparisler');
  } finally { globalThis.fetch = realFetch; }
});
