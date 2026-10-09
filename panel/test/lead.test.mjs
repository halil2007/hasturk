// Tanıtım sitesinden demo talebi: yalnız izin verilen siteden, CORS, bot tuzağı, saat sınırı; talep Destek'e "Web sitesi" olarak düşer
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import worker from '../src/index.js';

const req = (env, body, origin = 'https://hasturkcrm.com', method = 'POST', ip = '1.1.1.1') => worker.fetch(new Request('https://panel.test/api/public/lead', { method, headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': ip }, body: method === 'POST' ? JSON.stringify(body) : undefined }), env, { waitUntil() {} });

test('demo talebi: CORS, doğrulama, bot tuzağı, saat sınırı; Destek\'e düşer', async () => {
  const env = { PANEL_PASSWORD: 'x-123456', DB: d1() };
  const pre = await req(env, null, 'https://hasturkcrm.com', 'OPTIONS');
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('Access-Control-Allow-Origin'), 'https://hasturkcrm.com');
  assert.equal((await req(env, { name: 'Ali' }, 'https://kotu.site')).status, 403);
  assert.equal((await req(env, { name: 'Ali', email: 'yok', consent: true })).status, 400);
  assert.equal((await req(env, { name: 'Ali', phone: '0555 000 00 00', email: 'ali@ornek.com', consent: false })).status, 400);
  // e-posta ve telefon ikisi de zorunlu, biçimleri doğrulanır
  assert.equal((await req(env, { name: 'Ali', phone: '0555 000 00 00', consent: true })).status, 400, 'e-posta yok');
  assert.equal((await req(env, { name: 'Ali', email: 'ali@ornek.com', consent: true })).status, 400, 'telefon yok');
  assert.equal((await req(env, { name: 'Ali', email: 'ali@ornek', phone: '0555 000 00 00', consent: true })).status, 400, 'e-posta biçimi');
  assert.equal((await req(env, { name: 'Ali', email: 'ali@ornek.com', phone: '0555 000', consent: true })).status, 400, 'eksik telefon');
  assert.equal((await req(env, { name: 'Ali', email: 'ali@ornek.com', phone: '0155 000 00 00', consent: true })).status, 400, 'geçersiz alan kodu');
  const ok = await req(env, { name: 'Ali Veli', company: 'Yeşil Bahçe', phone: '0555 000 00 00', email: 'ali@ornek.com', channels: ['Trendyol', 'ikas'], message: 'Demo istiyorum', consent: true });
  assert.equal(ok.status, 200); assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://hasturkcrm.com');
  const t = await env.DB.prepare("SELECT * FROM support_tickets WHERE firm = 'Web sitesi'").first();
  assert.match(t.subject, /Demo talebi: Yeşil Bahçe/); assert.equal(t.category, 'request'); assert.equal(t.unread_admin, 1);
  const m = await env.DB.prepare('SELECT body FROM support_messages WHERE ticket_id = ?').bind(t.id).first();
  assert.match(m.body, /Trendyol, ikas/); assert.match(m.body, /0555/);
  // bot tuzağı: kayıt oluşmaz
  await req(env, { name: 'Bot', phone: '0555 000 00 00', email: 'bot@spam.com', consent: true, website: 'http://spam' });
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM support_tickets").first()).n, 1);
  // saat sınırı (IP başına 5)
  let last;
  for (let i = 0; i < 6; i++) last = await req(env, { name: 'Ayşe', phone: '+90 212 555 00 00', email: 'ayse@ornek.com', consent: true }, 'https://hasturkcrm.com', 'POST', '2.2.2.2');
  assert.equal(last.status, 429);
});
