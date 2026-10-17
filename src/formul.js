// HG toprak formülleri (gizli). Formüller depoda yalnız şifreli durur (src/formul.enc.json): AES-GCM ile şifreli içerik,
// AES anahtarı Worker'ın RSA-OAEP açık anahtarıyla sarılı. Özel anahtar yalnız Cloudflare D1'de (tablo "gizli") durur ve
// ilk /tarif-anahtar isteğinde Worker içinde üretilir; hiçbir yere yazılmaz, gösterilmez. Şifreleme:
// node scripts/formul-sifrele.mjs <formuller.json> <acik-anahtar.json> (açık anahtar /tarif-anahtar'dan).
// /tarif: bitkinin kendi toprağı → formül birebir; benzer toprak → o formül + bitkinin farkı kadar küçük ayar.
import ENC from './formul.enc.json';
import { soilParts, profil, grupKey } from './toprak.js';

const H = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' };
const ALG = { name: 'RSA-OAEP', hash: 'SHA-256' };
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let ready = false, F = null, FT = 0;

async function tablo(db) {
  if (ready) return;
  await db.exec('CREATE TABLE IF NOT EXISTS gizli (ad TEXT PRIMARY KEY, v TEXT NOT NULL)');
  ready = true;
}
async function oku(db, ad) { const r = await db.prepare('SELECT v FROM gizli WHERE ad = ?').bind(ad).first(); return r ? r.v : null; }

// Açık anahtar (yoksa çift üretilir; aynı anda gelen iki istekte ilk yazılan kalır)
export async function anahtar(env) {
  if (!env.DB) return new Response('{"ok":false}', { status: 503, headers: H });
  await tablo(env.DB);
  let acik = await oku(env.DB, 'formul-acik');
  if (!acik) {
    const k = await crypto.subtle.generateKey({ ...ALG, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']);
    const ozel = JSON.stringify(await crypto.subtle.exportKey('jwk', k.privateKey));
    acik = JSON.stringify(await crypto.subtle.exportKey('jwk', k.publicKey));
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO gizli (ad, v) VALUES (?, ?)').bind('formul-ozel', ozel),
      env.DB.prepare('INSERT OR IGNORE INTO gizli (ad, v) VALUES (?, ?)').bind('formul-acik', acik),
    ]);
    acik = await oku(env.DB, 'formul-acik');
  }
  return new Response(JSON.stringify({ ok: true, acik: JSON.parse(acik) }), { headers: { ...H, 'Cache-Control': 'no-store' } });
}

// Çözülmüş formüller: { slug: [[ölçü, bileşen], …] } ya da null (şifreli dosya boş / anahtar yok / çözülemedi)
export async function formuller(env) {
  if (F || !ENC || !ENC.ct || !env.DB) return F;
  if (Date.now() - FT < 60000) return null; // başarısız denemeyi her istekte tekrarlama
  FT = Date.now();
  try {
    await tablo(env.DB);
    const ozel = await oku(env.DB, 'formul-ozel');
    if (!ozel) return null;
    const pk = await crypto.subtle.importKey('jwk', JSON.parse(ozel), ALG, false, ['decrypt']);
    const raw = await crypto.subtle.decrypt(ALG, pk, b64(ENC.k));
    const ak = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    const d = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(ENC.iv) }, ak, b64(ENC.ct));
    F = JSON.parse(new TextDecoder().decode(d));
  } catch (e) { F = null; }
  return F;
}

// Toprak profili "ph dr su bs yapı" (config.json > soilMatch.soils, ör. "2122d")
const topProf = (s) => /^[1-4][1-3][1-3][1-3][khd]$/.test(s || '') ? { ph: +s[0], dr: +s[1], su: +s[2], bs: +s[3], yp: s[4] } : null;

// Benzer toprağın formülünü bitkiye uyarla: yalnız küçük farklar (pH için torf türü; süzülme, nem, besin farkı için
// en çok 1'er ölçü)
export function uyarla(f, pf, sp) {
  const x = f.map(([n, k]) => [n, k]);
  const get = (k) => x.find((r) => r[1] === k);
  const ekle = (n, k) => { const r = get(k); if (r) r[0] += n; else x.push([n, k]); };
  const azalt = (n, k) => { const r = get(k); if (!r) return 0; const d = Math.min(n, r[0]); r[0] -= d; return d; };
  const asit = pf.ph2 <= 1 || (pf.ph <= 1 && pf.ph2 <= 2);
  for (const r of x) { if (asit && r[1] === 'sphagnum') r[1] = 'asidik'; else if (!asit && r[1] === 'asidik') r[1] = 'sphagnum'; }
  if (sp) {
    const dd = Math.sign(pf.dr - sp.dr), ds = Math.sign(pf.su - sp.su), db = Math.sign(pf.bs - sp.bs); // her özellikte en çok 1 adım
    if (dd > 0) ekle(dd, pf.yp === 'k' || get('pomza') ? 'pomza' : 'kalin-perlit');
    if (dd < 0) { const k = -dd - azalt(-dd, 'pomza'), p = get('kalin-perlit'); if (k > 0 && p && p[0] > 1) p[0] -= Math.min(k, p[0] - 1); }
    if (ds > 0) ekle(ds, 'vermikulit');
    if (ds < 0) { const c = azalt(-ds, 'cocopeat'); if (c < -ds) ekle(-ds - c, 'pomza'); }
    if (db < 0 && !azalt(1, 'leonardit')) { const s = get('solucan'); if (s) s[0] = s[0] / 2; }
    if (db > 0) ekle(0.5, 'solucan');
  }
  const out = x.filter((r) => r[0] > 0);
  // Solucan gübresi toplamın en çok %20'si
  const top = out.reduce((a, r) => a + r[0], 0), s = out.find((r) => r[1] === 'solucan');
  if (s && s[0] > 0.2 * top) s[0] = Math.round(0.25 * (top - s[0]) * 2) / 2;
  return out.map(([n, k]) => [Math.round(n * 2) / 2, k]).filter((r) => r[0] > 0);
}

// GET /tarif?s=<toprak slug>&p=<bitki profili>&g=<grup>&sp=<toprak profili>&t=1 (t=1: bitkinin kendi toprağı, formül birebir)
export async function tarif(req, env) {
  const u = new URL(req.url).searchParams, s = u.get('s') || '', pf = profil(u.get('p')), g = grupKey(u.get('g') || '');
  const F = await formuller(env), f = F && F[s];
  const cc = { ...H, 'Cache-Control': 'public, max-age=3600' };
  if (f && (u.get('t') === '1' || !pf)) return new Response(JSON.stringify({ ok: true, kaynak: 'hg', s, parts: f }), { headers: cc });
  if (f && pf && !/^ozel/.test(g)) return new Response(JSON.stringify({ ok: true, kaynak: 'hg-uyarla', s, parts: uyarla(f, pf, topProf(u.get('sp'))) }), { headers: cc });
  if (pf) return new Response(JSON.stringify({ ok: true, kaynak: 'kural', parts: soilParts(pf, g) }), { headers: cc });
  return new Response('{"ok":false}', { status: 400, headers: H });
}
