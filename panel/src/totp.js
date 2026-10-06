// İki adımlı doğrulama (TOTP, RFC 6238): Google Authenticator, Microsoft Authenticator vb. uygulamalarla uyumlu.
// 30 saniyelik, 6 haneli kod (HMAC-SHA1). Saat farkı için ±1 adım kabul edilir; aynı kod ikinci kez kullanılamaz.
// Yedek kodlar (telefon kaybolursa) tek kullanımlıktır ve özetlenerek saklanır.
import qrcode from './vendor/qrcode.js';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function b32encode(bytes) {
  let bits = 0, v = 0, out = '';
  for (const b of bytes) { v = (v << 8) | b; bits += 8; while (bits >= 5) { out += B32[(v >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(v << (5 - bits)) & 31];
  return out;
}
export function b32decode(s) {
  const clean = String(s || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, v = 0;
  const out = [];
  for (const c of clean) { v = (v << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(out);
}
export const newSecret = () => b32encode(crypto.getRandomValues(new Uint8Array(20)));

export async function hotp(secret, counter) {
  const key = await crypto.subtle.importKey('raw', b32decode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}
export const step = (t = Date.now()) => Math.floor(t / 30000);

// Kod doğruysa kullanılan adımı döndürür (tekrar kullanımı engellemek için saklanır); değilse null
export async function verifyCode(secret, code, last = -1, t = Date.now()) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c) || !secret) return null;
  const s = step(t);
  for (const d of [0, -1, 1]) {
    if (s + d <= last) continue;
    if ((await hotp(secret, s + d)) === c) return s + d;
  }
  return null;
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const hashCode = async (c) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('2fa|' + String(c).toLowerCase().replace(/[^a-z0-9]/g, ''))));
// 10 yedek kod: "abcd-efgh" (küçük harf + rakam, karışan harfler yok)
export async function recoveryCodes() {
  const A = 'abcdefghjkmnpqrstuvwxyz23456789', codes = [];
  for (let i = 0; i < 10; i++) {
    const r = crypto.getRandomValues(new Uint8Array(8));
    const s = [...r].map((x) => A[x % A.length]).join('');
    codes.push(s.slice(0, 4) + '-' + s.slice(4));
  }
  return { codes, hashes: await Promise.all(codes.map(hashCode)) };
}

// Kimlik doğrulama uygulamasına eklenecek adres ve QR kodu (SVG)
export function otpauth({ issuer, account, secret }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
export function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
