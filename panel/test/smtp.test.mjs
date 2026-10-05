// Kendi e-posta sunucusundan gönderim: SMTP konuşması (465 SSL ve 587 STARTTLS), Türkçe konu, base64 gövde, hata mesajı
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smtpSend } from '../src/smtp.js';

// Sahte SMTP sunucusu: gelen satırlara sırayla cevap verir
function fakeConnect(log, { failAuth = false } = {}) {
  const make = (tls) => {
    const enc = new TextEncoder(), dec = new TextDecoder();
    let push; const q = [];
    const readable = new ReadableStream({ start(c) { push = (s) => c.enqueue(enc.encode(s)); } });
    let data = false, buf = '';
    const reply = (line) => {
      log.push((tls ? 'tls> ' : '> ') + line);
      if (data) { if (line === '.') { data = false; push('250 OK queued\r\n'); } return; }
      if (/^EHLO/.test(line)) push('250-mail.test\r\n250-AUTH LOGIN PLAIN\r\n250 STARTTLS\r\n');
      else if (line === 'STARTTLS') push('220 Ready\r\n');
      else if (line === 'AUTH LOGIN') push('334 VXNlcm5hbWU6\r\n');
      else if (log.filter((l) => /334|AUTH/.test(l)).length && /^[A-Za-z0-9+/=]+$/.test(line) && !log.includes('pass-sent')) {
        if (log.includes('user-sent')) { log.push('pass-sent'); push(failAuth ? '535 Authentication failed\r\n' : '235 OK\r\n'); } else { log.push('user-sent'); push('334 UGFzc3dvcmQ6\r\n'); }
      } else if (/^MAIL FROM|^RCPT TO/.test(line)) push('250 OK\r\n');
      else if (line === 'DATA') { data = true; push('354 Go\r\n'); } else if (line === 'QUIT') push('221 Bye\r\n');
    };
    const writable = new WritableStream({ write(chunk) { buf += dec.decode(chunk); let i; while ((i = buf.indexOf('\r\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2); reply(l); } } });
    return { readable, writable, push: (s) => push(s), startTls: () => { log.push('starttls'); const t = make(true); return t; }, close() {} };
  };
  return (addr, opts) => { log.push(`connect ${addr.hostname}:${addr.port} ${opts.secureTransport}`); const s = make(opts.secureTransport === 'on'); setTimeout(() => s.push('220 mail.test ESMTP\r\n'), 0); return s; };
}
const MAIL = { host: 'mail.test', user: 'bildirim@firma.com', pass: 'gizli', from: 'bildirim@firma.com', fromName: 'Hastürk Panel', to: ['a@firma.com', 'b@firma.com'], subject: 'Yeni sipariş: Çiçek', html: '<b>Merhaba</b>', text: 'Merhaba' };

test('SMTP 465: SSL, AUTH LOGIN, iki alıcı, UTF-8 konu ve base64 gövde', async () => {
  const log = [];
  await smtpSend({ ...MAIL, port: 465 }, { connect: fakeConnect(log) });
  assert.equal(log[0], 'connect mail.test:465 on');
  const has = (x) => log.includes('tls> ' + x);
  assert.ok(has('MAIL FROM:<bildirim@firma.com>'));
  assert.ok(has('RCPT TO:<a@firma.com>') && has('RCPT TO:<b@firma.com>'));
  assert.ok(log.some((l) => l.startsWith('tls> Subject: =?UTF-8?B?')));
  assert.ok(has('Content-Transfer-Encoding: base64'));
  assert.ok(!log.includes('starttls'));
});

test('SMTP 587: STARTTLS sonra kimlik; hatalı şifre anlaşılır mesajla döner; 25 reddedilir', async () => {
  const log = [];
  await smtpSend({ ...MAIL, port: 587 }, { connect: fakeConnect(log) });
  assert.equal(log[0], 'connect mail.test:587 starttls');
  assert.ok(log.indexOf('starttls') > 0 && log.findIndex((l) => l === 'tls> AUTH LOGIN') > log.indexOf('starttls'));
  await assert.rejects(smtpSend({ ...MAIL, port: 465 }, { connect: fakeConnect([], { failAuth: true }) }), /şifre.*535/);
  await assert.rejects(smtpSend({ ...MAIL, port: 25 }, { connect: fakeConnect([]) }), /465/);
});
