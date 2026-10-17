// HG toprak formüllerini şifreler → src/formul.enc.json (depoya yalnız bu şifreli dosya girer; düz formüller asla).
// Kullanım: node scripts/formul-sifrele.mjs <formuller.json> <acik-anahtar.json>
//   formuller.json: { "<toprak slug>": [[ölçü, "bileşen"], …] } (bileşen: sphagnum, asidik, cocopeat, orman, kalin-perlit,
//   ince-perlit, pomza, vermikulit, bentonit, solucan, leonardit)
//   acik-anahtar.json: Worker'ın /tarif-anahtar cevabı ({ acik: JWK }); özel anahtar yalnız Cloudflare D1'de durur.
import { readFileSync, writeFileSync } from 'node:fs';
import { KAR_AD } from '../src/toprak.js';
const [fp, kp] = process.argv.slice(2);
if (!fp || !kp) { console.error('Kullanım: node scripts/formul-sifrele.mjs <formuller.json> <acik-anahtar.json>'); process.exit(1); }
const F = JSON.parse(readFileSync(fp, 'utf8'));
for (const [s, v] of Object.entries(F)) {
  if (!/^[a-z0-9-]+$/.test(s) || !Array.isArray(v) || !v.every((r) => r[0] > 0 && KAR_AD[r[1]])) { console.error('Geçersiz formül: ' + s); process.exit(1); }
}
const k = JSON.parse(readFileSync(kp, 'utf8')), jwk = k.acik || k;
const ALG = { name: 'RSA-OAEP', hash: 'SHA-256' }, s = crypto.subtle;
const pub = await s.importKey('jwk', jwk, ALG, false, ['encrypt']);
const ak = await s.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
const iv = crypto.getRandomValues(new Uint8Array(12));
const ct = await s.encrypt({ name: 'AES-GCM', iv }, ak, new TextEncoder().encode(JSON.stringify(F)));
const wk = await s.encrypt(ALG, pub, await s.exportKey('raw', ak));
const b64 = (b) => Buffer.from(b).toString('base64');
writeFileSync(new URL('../src/formul.enc.json', import.meta.url), JSON.stringify({ v: 1, n: Object.keys(F).length, k: b64(wk), iv: b64(iv), ct: b64(ct) }) + '\n');
console.log(`Şifrelendi: ${Object.keys(F).length} formül → src/formul.enc.json`);
