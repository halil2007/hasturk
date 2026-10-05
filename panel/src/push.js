// Anlık bildirim (Web Push): yeni sipariş, iade talebi ve müşteri sorusu telefona / bilgisayara bildirim olarak gelir.
// Dış servis yok: tarayıcının kendi push servisi (Chrome / Safari / Firefox) VAPID imzasıyla çağrılır. Bildirim içeriği şifreli
// gövdeyle gönderilmez; telefondaki servis çalışanı (sw.js) bildirimi alınca metni panelden (/api/push/latest) okur.
// iPhone'da bildirim için panel ana ekrana eklenmiş olmalı (Safari → Paylaş → Ana Ekrana Ekle; iOS 16.4+).
import { all, first, run, getRaw, setSetting } from './db.js';
import { fail, str } from './util.js';

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));

// VAPID anahtarı: ilk kullanımda üretilir, ayarlarda saklanır (özel anahtar yalnız sunucuda kalır)
async function vapid(db) {
  let v = await getRaw(db, 'vapid');
  if (v && v.publicKey && v.privateJwk) return v;
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  v = { publicKey: b64u(await crypto.subtle.exportKey('raw', k.publicKey)), privateJwk: await crypto.subtle.exportKey('jwk', k.privateKey) };
  await setSetting(db, 'vapid', v);
  return v;
}
export async function publicKey(db) { return (await vapid(db)).publicKey; }

async function jwt(v, aud) {
  const key = await crypto.subtle.importKey('jwk', v.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const data = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:bildirim@hasturk.local' })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(data));
  return `${data}.${b64u(sig)}`;
}

export async function subscribe(db, user, sub, ua) {
  const endpoint = str(sub && sub.endpoint);
  if (!/^https:\/\//.test(endpoint)) fail(400, 'Geçersiz bildirim aboneliği');
  await run(db, `INSERT INTO push_subs (endpoint, user_id, ua, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, ua = excluded.ua`, endpoint, user.id ?? null, str(ua).slice(0, 200), Date.now());
  return { ok: true };
}
export async function unsubscribe(db, endpoint) { await run(db, 'DELETE FROM push_subs WHERE endpoint = ?', str(endpoint)); return { ok: true }; }
export async function latest(db) { return (await getRaw(db, 'push_latest')) || { title: 'Hastürk Panel', body: 'Yeni bildirim', url: '#/' }; }

// Tüm abonelere bildirim: içerik "son bildirim" olarak saklanır, abonelere boş push gider. Süresi dolmuş abonelik silinir.
export async function notify(db, msg, { fetchFn = fetch } = {}) {
  const subs = await all(db, 'SELECT endpoint FROM push_subs');
  await setSetting(db, 'push_latest', { ...msg, at: Date.now() });
  if (!subs.length) return { sent: 0 };
  const v = await vapid(db);
  let sent = 0;
  for (const s of subs) {
    try {
      const r = await fetchFn(s.endpoint, { method: 'POST', headers: { TTL: '3600', Urgency: 'high', 'Content-Length': '0', Authorization: `vapid t=${await jwt(v, new URL(s.endpoint).origin)}, k=${v.publicKey}` } });
      if (r.status === 404 || r.status === 410) await run(db, 'DELETE FROM push_subs WHERE endpoint = ?', s.endpoint);
      else if (r.ok) sent++;
    } catch { /* tek abonelikteki hata diğerlerini durdurmasın */ }
  }
  return { sent };
}

// Senkron sonunda: son bildirimden bu yana yeni sipariş / iade / soru varsa tek bir özet bildirim
export async function pushDigest(env, db, { newOrders = 0 } = {}) {
  if (env.DEMO === '1') return null;
  const t = Date.now(), last = await getRaw(db, 'push_last_at');
  await setSetting(db, 'push_last_at', t);
  if (!last || !(await first(db, 'SELECT 1 AS x FROM push_subs LIMIT 1'))) return null;
  const claims = (await first(db, "SELECT COUNT(*) AS n FROM claims WHERE status = 'waiting' AND claimed_at > ?", last)).n;
  const questions = (await first(db, "SELECT COUNT(*) AS n FROM questions WHERE status = 'waiting' AND asked_at > ?", last)).n;
  const parts = [newOrders && `${newOrders} yeni sipariş`, claims && `${claims} iade talebi`, questions && `${questions} müşteri sorusu`].filter(Boolean);
  if (!parts.length) return null;
  const url = newOrders ? '#/siparisler' : claims ? '#/iadeler' : '#/sorular';
  return notify(db, { title: newOrders ? `🛒 ${newOrders} yeni sipariş` : 'Hastürk Panel', body: parts.join(' · '), url });
}
