// Ak Bilge (isim config.json > akbilge.name ile değişir): müşterinin tarım sorusunu cevaplar.
//   1) Soru önce hazır soru havuzunda aranır (src/akbilge-havuz.json; scripts/akbilge-havuz.mjs üretir). Bulunursa cevap
//      anında ve ücretsiz döner. Havuzdaki rakamlar yalnız doğrulanmış tablolardan gelir.
//   2) Bulunamazsa ve anahtar + günlük sınır uygunsa Claude'a sorulur: en yakın havuz cevapları ve ilgili ürünler bağlam
//      olarak verilir, model yalnız bu bağlamdaki rakamları ve ürünleri kullanabilir.
//   3) Claude'un cevabı veritabanına 'onay-bekliyor' olarak yazılır; onaylanan cevaplar sonraki aynı soruda havuzdan gelir.
// Kişisel veri tutulmaz: soru metni, cevap, tarih; IP / çerez / kimlik yok.
import Anthropic from '@anthropic-ai/sdk';
import HAVUZ from './akbilge-havuz.json';

export const MODEL = 'claude-opus-5-5';
const DAILY_LIMIT = 150;     // günde en fazla bu kadar Claude sorgusu (env.AK_DAILY_LIMIT ile değişir)
const MAX_Q = 300;           // karakter

// ---------- Türkçe metin ----------
const FOLD = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
export const norm = (s) => String(s || '').toLocaleLowerCase('tr-TR').replace(/[çğıöşüâîû]/g, (c) => FOLD[c])
  .replace(/[^a-z0-9]+/g, ' ').trim();
// Soruya anlam katmayan dolgu kelimeleri (soru kalıbı kelimeleri — ne, nasıl, kaç… — KALIR, niyeti onlar taşır)
const FILL = new Set(['merhaba', 'selam', 'selamlar', 'iyi', 'gunler', 'aksamlar', 'lutfen', 'acaba', 'abi', 'abla', 'hocam', 'usta', 'kardesim',
  'tesekkurler', 'tesekkur', 'ederim', 'almaliyim', 'almali', 'alayim', 'alsam', 'almak', 'onerirsiniz', 'onerir', 'misiniz', 'musunuz', 'yardimci', 'olur', 'musun', 'sayin', 'yetkili', 'bilgi', 'alabilir', 'miyim', 'sormak', 'istiyorum', 'istiyordum', 'bir', 'bu', 'su', 've', 'ile', 'ya', 'da', 'de', 'ki', 'mi', 'mu', 'benim', 'bana', 'sizde']);
const stem = (t) => (t.length > 5 ? t.slice(0, 5) : t);
// "ağaç/ağacı/ağacına" bitki adının parçası olarak anlam katmaz (limon ağacı = limon)
const FILL_STEM = new Set(['agac', 'agaci', 'agacl', 'agacm']);
export const toks = (s) => [...new Set(norm(s).split(' ').filter((t) => t && !FILL.has(t)).map(stem).filter((t) => !FILL_STEM.has(t)))];

// ---------- Havuz dizini (her Worker örneğinde bir kez kurulur) ----------
let IDX = null;
function index(extra = []) {
  if (IDX && !extra.length) return IDX;
  const entries = HAVUZ.concat(extra), pats = [], df = new Map();
  entries.forEach((e, ei) => e.s.forEach((q) => {
    const ts = toks(q); if (!ts.length) return;
    pats.push({ ei, ts });
    ts.forEach((t) => df.set(t, (df.get(t) || 0) + 1));
  }));
  const N = pats.length, idf = new Map();
  df.forEach((n, t) => idf.set(t, Math.log(1 + N / n)));
  const byTok = new Map(); // ters dizin: kelime → kalıplar
  pats.forEach((p, pi) => { p.w = p.ts.reduce((a, t) => a + idf.get(t), 0); p.ts.forEach((t) => { if (!byTok.has(t)) byTok.set(t, []); byTok.get(t).push(pi); }); });
  const built = { entries, pats, idf, byTok, N };
  if (!extra.length) IDX = built;
  return built;
}
// Konu kelimeleri: soru "gübre" diye soruyorsa "toprak" cevabı verilmez (bu kelimeler sık geçtiği için idf'leri düşük kalır)
const TOPIC = { gubre: 'g', besin: 'g', dozu: 'g', topra: 't', harci: 't', tohum: 'e', ekili: 'e', ekim: 'e', ekme: 'e', saksi: 's', pompa: 'p', ilac: 'i', ilacl: 'p' };
const topics = (ts) => new Set(ts.map((t) => TOPIC[t]).filter(Boolean));
// Kelime benzerliği: aynı kök 1; ilk 4 harf aynı (yazım farkı, ek) 0,7
const sim = (a, b) => (a === b ? 1 : a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4) ? 0.7 : 0);

// En iyi eşleşmeler: kalıbın büyük kısmı soruda, sorunun büyük kısmı kalıpta olmalı (idf ağırlıklı)
export function match(q, { extra = [], top = 5, product = null } = {}) {
  const X = index(extra), qt = toks(q);
  if (!qt.length) return [];
  const qi = (t) => X.idf.get(t) || Math.log(1 + X.N); // havuzda hiç geçmeyen kelime: en nadir sayılır
  const qw = qt.reduce((a, t) => a + qi(t), 0), qtop = topics(qt);
  const cand = new Set();
  qt.forEach((t) => { (X.byTok.get(t) || []).forEach((pi) => cand.add(pi)); if (t.length >= 4) X.byTok.forEach((list, k) => { if (k !== t && k.slice(0, 4) === t.slice(0, 4)) list.forEach((pi) => cand.add(pi)); }); });
  const best = new Map();
  cand.forEach((pi) => {
    const p = X.pats[pi];
    let hitP = 0, hitQ = 0;
    p.ts.forEach((t) => { let m = 0; qt.forEach((u) => { m = Math.max(m, sim(t, u)); }); hitP += m * X.idf.get(t); });
    qt.forEach((u) => { let m = 0; p.ts.forEach((t) => { m = Math.max(m, sim(t, u)); }); hitQ += m * qi(u); });
    const cp = hitP / p.w, cq = hitQ / qw;
    let sc = 2 * cp * cq / (cp + cq || 1); // iki yönlü kapsama (F1)
    if (qtop.size) { const pt = topics(p.ts); if (pt.size && ![...qtop].some((x) => pt.has(x))) sc *= 0.5; }
    // Belirli bir bitkiye ait cevap (doz, toprak, ekim) yalnız o bitki soruda geçiyorsa verilir
    const eb = X.entries[p.ei].b;
    if (eb) { const bt = toks(eb.replace(/\(.*?\)/g, ' ')); if (bt.length && !bt.some((t) => qt.some((u) => sim(t, u) > 0))) sc *= 0.4; }
    if (product && X.entries[p.ei].p === product) sc += 0.08; // müşterinin bulunduğu ürün sayfasıyla ilgili cevaba hafif öncelik
    const prev = best.get(p.ei);
    if (!prev || sc > prev.sc) best.set(p.ei, { sc, cp, cq, pat: p });
  });
  return [...best.entries()].sort((a, b) => b[1].sc - a[1].sc).slice(0, top)
    .map(([ei, r]) => ({ e: X.entries[ei], sc: +r.sc.toFixed(3), cp: +r.cp.toFixed(3), cq: +r.cq.toFixed(3) }));
}
// Havuzdan cevap verilecek kadar emin miyiz
export const SURE = 0.72;
const AYLAR = ['ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran', 'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'];
// "bu ay ne ekilir" → "ekim ayında ne ekilir" (Türkiye saatine göre bu ay)
const buAy = (q) => q.replace(/\b(bu|şu an(ki)?|şimdiki) ay(ı|da|ında|ki)?\b/giu, AYLAR[new Date(Date.now() + 3 * 3600e3).getUTCMonth()] + ' ayında');
export function poolAnswer(q, opts = {}) {
  q = buAy(q);
  let r = match(q, opts);
  // Ürün sayfasındaysa ve soruda ürün adı yoksa ("bunu nasıl kullanırım", "kaç litre"), ürün adıyla birlikte de dene
  if (opts.productName && (!r[0] || r[0].sc < SURE)) {
    const r2 = match(q + ' ' + opts.productName, opts).filter((x) => x.e.p === opts.product);
    if (r2[0] && (!r[0] || r2[0].sc > r[0].sc)) r = r2.concat(r);
  }
  return { hit: r[0] && r[0].sc >= SURE && r[0].cp >= 0.65 && r[0].cq >= 0.8 ? r[0] : null, near: r };
}

// ---------- Claude ----------
export function systemPrompt(name) {
  return `Sen ${name}'sin: HasTürk Gübre'nin (hasturkgubre.com.tr) çevrimiçi tarım ve bahçe danışmanısın. Müşterilerin gübre, toprak, tohum, saksı, bitki bakımı ve ilaçlama ekipmanı sorularını Türkçe, sade ve kısa cevaplarsın.

Müşteriler emek, para ve zaman harcıyor: yanlış ya da alakasız bir cevap, hiç cevap vermemekten daha kötüdür. Her ne pahasına cevap vermeye çalışma; doğru bilgin yoksa müşteriyi ustamıza yönlendir. Gereken yerde yönlendirmekten çekinme, ama bildiğin ve güvenli olan temel bilgiyi de esirgeme.

Kurallar:
- Cevabın 120 kelimeyi geçmesin; gerekirse 2–4 maddelik liste kullan. "Siz" diye hitap et. Selamlama ve övgü cümlesi yazma.
- Rakam (doz, miktar, litre, gün, cm, sıcaklık, oran) YALNIZCA kullanıcı mesajındaki "Doğrulanmış bilgi" bölümünde, sorulan bitki ve ürün için geçiyorsa kullanılır. Başka bir bitkinin ya da ürünün rakamını bu soruya uyarlama. Rakam yoksa rakam verme.
- "Doğrulanmış bilgi" soruyla ilgisizse onu kullanma; sorulmayan bir konuyu anlatma.
- Zirai ilaç, böcek/haşere/kemirgen ilacı ve dezenfektanlar için asla doz, karışım oranı veya uygulama tarifi verme: ürün etiketine uyulmasını söyle.
- Ürün önerisi yalnız "Önerilebilecek ürünler" listesinden ve yalnız soruyla gerçekten ilgiliyse yapılır; listede olmayan ürün, marka veya rakip mağaza adı yazma.
- Bitki hastalığı ya da zararlı teşhisi koyma; en fazla olası nedenleri say ve fotoğrafla ustamıza danışılmasını öner. İnsan veya hayvan sağlığı konusunda tavsiye verme.
- Mağaza bilgisi: siparişler aynı gün kargoya teslim edilir; teslim süresi kargo firmasına ve adrese göre değişir. Bunun dışındaki sipariş durumu, kargo takibi, iade, fiyat, kampanya ve stok sorularını cevaplama; bu konular için ustamıza yönlendir.

"durum" alanı:
- "cevap": soruyu doğru ve güvenle cevapladın.
- "yonlendir": soru insan desteği gerektiriyor (sipariş/kargo/iade, teşhis, elinde doğru bilgi olmayan teknik soru). "cevap" alanına müşteriye kısa ve nazik bir yönlendirme cümlesi yaz.
- "konu_disi": soru tarım, bahçe ve mağazayla ilgisiz; kibarca yalnız bu konularda yardımcı olabildiğini yaz.
"emin" alanı: cevabındaki her bilgi ya "Doğrulanmış bilgi"de geçiyorsa ya da kimseyi yanıltmayacak kadar temel, herkesçe kabul gören bahçe bilgisiyse (ör. "fesleğen güneşli yer sever") true; en küçük bir şüphen varsa false.

Cevabı yalnız istenen JSON biçiminde ver: "cevap" müşteriye gösterilecek metin; "urunler" listeden seçtiğin ürünlerin kodları (en fazla 3, uygun yoksa boş); "durum"; "emin".`;
}
const SCHEMA = {
  type: 'object',
  properties: {
    cevap: { type: 'string' },
    urunler: { type: 'array', items: { type: 'string' } },
    durum: { type: 'string', enum: ['cevap', 'yonlendir', 'konu_disi'] },
    emin: { type: 'boolean' },
  },
  required: ['cevap', 'urunler', 'durum', 'emin'],
  additionalProperties: false,
};

// Bağlam: en yakın havuz cevapları (doğrulanmış) + onlardaki ürünler + soruda adı geçen ürünler
function context(q, near, products) {
  // Maliyet: en yakın 3 cevap, her biri en fazla ~900 karakter (rakamlar ve kaynak satırı genelde baştadır)
  const facts = near.filter((x) => x.sc >= 0.35).slice(0, 3).map((x) => (x.e.c.length > 900 ? x.e.c.slice(0, 900) + '…' : x.e.c));
  const slugs = new Set();
  near.slice(0, 4).forEach((x) => x.e.u.forEach((s) => slugs.add(s)));
  const qt = toks(q);
  products.map((p) => ({ p, h: toks(p.n).filter((t) => qt.includes(t)).length })).filter((x) => x.h >= 1)
    .sort((a, b) => b.h - a.h).slice(0, 6).forEach((x) => slugs.add(x.p.s));
  const byS = new Map(products.map((p) => [p.s, p]));
  const list = [...slugs].map((s) => byS.get(s)).filter((p) => p && p.st).slice(0, 10);
  return { facts, list };
}
export function userMessage(q, ctx, page) {
  return `Doğrulanmış bilgi:\n${ctx.facts.length ? ctx.facts.map((f, i) => `[${i + 1}] ${f}`).join('\n\n') : '(yok)'}\n\n` +
    `Önerilebilecek ürünler (kod — ad):\n${ctx.list.length ? ctx.list.map((p) => `${p.s} — ${p.n}`).join('\n') : '(yok)'}\n\n` +
    (page ? `Müşterinin bulunduğu ürün sayfası: ${page}\n\n` : '') +
    `Müşterinin sorusu: ${q}`;
}

async function askClaude(env, key, name, q, ctx, page) {
  const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 25000 });
  const msg = await client.beta.messages.create({
    model: env.AK_MODEL || MODEL,
    max_tokens: 2500,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    // Uzun ve sabit sistem talimatı önbelleğe alınır (her soruda yeniden ücretlendirilmesin)
    system: [{ type: 'text', text: systemPrompt(name), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage(q, ctx, page) }],
  });
  if (msg.stop_reason === 'refusal') return { refused: true, usage: msg.usage };
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  let out;
  try { out = JSON.parse(text); } catch { return { error: 'json', usage: msg.usage }; }
  if (msg.stop_reason === 'max_tokens' || typeof out.cevap !== 'string' || !out.cevap.trim()) return { error: 'kesik', usage: msg.usage };
  const allowed = new Set(ctx.list.map((p) => p.s));
  return { cevap: out.cevap.trim(), urunler: (out.urunler || []).filter((s) => allowed.has(s)).slice(0, 3), durum: out.durum || 'cevap', emin: !!out.emin, usage: msg.usage, model: msg.model };
}

// ---------- Veritabanı ----------
let dbReady = false;
async function initDb(db) {
  if (dbReady) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS ak_soru (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, q TEXT NOT NULL, qn TEXT NOT NULL, kaynak TEXT NOT NULL, havuz TEXT, skor REAL, cevap TEXT, urunler TEXT, durum TEXT, site TEXT, sayfa TEXT, giris INTEGER, cikis INTEGER)'),
    db.prepare('CREATE INDEX IF NOT EXISTS ak_soru_durum ON ak_soru (durum, ts)'),
    db.prepare('CREATE TABLE IF NOT EXISTS ak_gun (d TEXT PRIMARY KEY, n INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS ak_oy (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, q TEXT NOT NULL, kaynak TEXT, havuz TEXT, oy INTEGER NOT NULL, site TEXT)'),
  ]);
  dbReady = true;
}
// Onaylanmış Claude cevapları havuza eklenir (5 dakikada bir tazelenir)
let APPROVED = { t: 0, list: [] };
async function approved(db) {
  if (Date.now() - APPROVED.t < 300000) return APPROVED.list;
  const { results } = await db.prepare("SELECT id, q, cevap, urunler FROM ak_soru WHERE durum = 'onaylandi' ORDER BY id DESC LIMIT 2000").all();
  APPROVED = { t: Date.now(), list: results.map((r) => ({ i: 'o' + r.id, t: 'onayli', s: [r.q], c: r.cevap, u: JSON.parse(r.urunler || '[]') })) };
  return APPROVED.list;
}

// POST /ak/oy {q, k (kaynak), h (havuz id), oy: 1|0}: müşterinin "işinize yaradı mı" oyu. Olumsuz oylar incelenip
// havuz/kurallar düzeltilir.
export async function vote(req, env, okOrigin) {
  if (!okOrigin || !env.DB) return json({ ok: false }, okOrigin ? 200 : 403);
  let b; try { b = await req.json(); } catch { return json({ ok: false }, 400); }
  const q = String(b.q || '').replace(/\s+/g, ' ').trim().slice(0, MAX_Q);
  if (q.length < 3 || (b.oy !== 1 && b.oy !== 0)) return json({ ok: false }, 400);
  await initDb(env.DB).catch(() => {});
  await env.DB.prepare('INSERT INTO ak_oy (ts, q, kaynak, havuz, oy, site) VALUES (?,?,?,?,?,?)')
    .bind(new Date().toISOString(), q, String(b.k || '').slice(0, 20), /^[ho]\d{1,6}$/.test(b.h || '') ? b.h : null, b.oy, /^[a-z]{1,20}$/.test(b.s || '') ? b.s : 'hasturk').run().catch(() => {});
  return json({ ok: true });
}

// GET /ak/sayac: bugün ve son 7 gün kaç soru havuzdan / Claude'dan cevaplandı, Claude token kullanımı ve tahmini maliyet.
// Soru metni gösterilmez (yalnız sayılar).
export async function sayac(env) {
  if (!env.DB) return json({ ok: false, why: 'db' });
  await initDb(env.DB).catch(() => {});
  const gun = today(), hafta = new Date(Date.now() + 3 * 3600e3 - 7 * 864e5).toISOString().slice(0, 10);
  const q = (since) => env.DB.prepare("SELECT kaynak, COALESCE(durum,'') AS durum, COUNT(*) AS n, SUM(COALESCE(giris,0)) AS giris, SUM(COALESCE(cikis,0)) AS cikis FROM ak_soru WHERE substr(ts,1,10) >= ? GROUP BY kaynak, durum").bind(since).all().then((r) => r.results);
  const oy = await env.DB.prepare('SELECT oy, COUNT(*) AS n FROM ak_oy GROUP BY oy').all().then((r) => r.results).catch(() => []);
  const [b, h] = await Promise.all([q(gun), q(hafta)]);
  const ozet = (rows) => {
    const ai = rows.filter((r) => r.kaynak === 'ai'), giris = ai.reduce((a, r) => a + r.giris, 0), cikis = ai.reduce((a, r) => a + r.cikis, 0);
    return { satir: rows, toplam: rows.reduce((a, r) => a + r.n, 0), havuz: rows.filter((r) => r.kaynak === 'havuz').reduce((a, r) => a + r.n, 0),
      claude: ai.reduce((a, r) => a + r.n, 0), giris, cikis, tahmini_usd: +((giris * 4 + cikis * 20) / 1e6).toFixed(3) };
  };
  return json({ ok: true, bugun: ozet(b), son7: ozet(h), oylar: oy, model: env.AK_MODEL || MODEL, gunluk_sinir: Number(env.AK_DAILY_LIMIT) || DAILY_LIMIT });
}

// GET /ak/populer: son 30 günde havuzdan en çok cevaplanan sorular (öne çıkan sorular; en az 3 kez sorulmuş olmalı)
let POP = { t: 0, list: [] };
export async function populer(env) {
  if (Date.now() - POP.t < 600000) return json({ ok: true, sorular: POP.list });
  let list = [];
  if (env.DB) {
    await initDb(env.DB).catch(() => {});
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const { results } = await env.DB.prepare("SELECT havuz, MAX(q) AS q, COUNT(*) AS n FROM ak_soru WHERE kaynak = 'havuz' AND ts >= ? GROUP BY havuz HAVING n >= 3 ORDER BY n DESC LIMIT 6")
      .bind(since).all().catch(() => ({ results: [] }));
    list = results.map((r) => String(r.q || '').slice(0, 80)).filter((q) => q.length >= 6);
  }
  POP = { t: Date.now(), list };
  return json({ ok: true, sorular: list });
}

const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // Türkiye saati
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } });

// POST /ak  {q, p (ürün sayfası adresi), s (site), n (asistan adı)}
export async function handle(req, env, ctx, { aiKey, originOk, products }) {
  if (!originOk) return json({ ok: false, why: 'origin' }, 403);
  let body;
  try { body = await req.json(); } catch { return json({ ok: false, why: 'json' }, 400); }
  const q = String(body.q || '').replace(/\s+/g, ' ').trim().slice(0, MAX_Q);
  if (q.length < 3) return json({ ok: false, why: 'kisa' }, 400);
  const page = /^[a-z0-9-]{1,140}$/.test(body.p || '') ? body.p : null;
  const site = /^[a-z0-9-]{1,30}$/.test(body.s || '') ? body.s : 'hasturk';
  const name = String(body.n || 'Ak Bilge').replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 30) || 'Ak Bilge';
  const db = env.DB;
  if (db) await initDb(db).catch(() => {});
  const extra = db ? await approved(db).catch(() => []) : [];
  const prods = await products().catch(() => []);
  const pageName = page ? ((prods.find((p) => p.s === page) || {}).n || '') : '';
  let { hit, near } = poolAnswer(q, { extra, product: page, productName: pageName });
  // Ürün sayfasında "nasıl kullanılır / ne işe yarar / dozu / özellikleri" gibi sorular o ürünün havuz cevabından gelir
  // (soru ürün adını tam içermese de; Claude'a gidip para harcamasın)
  if (!hit && page && /kullan|işe yar|ise yar|nedir|özellik|ozellik|doz|miktar|nasıl|nasil|kaç litre|kac litre|ölçü|olcu|ekilir/i.test(q)) {
    const pe = HAVUZ.find((e) => e.p === page && (e.t === 'urun' || e.t === 'saksi' || e.t === 'pompa'));
    if (pe && !toks(q).some((t) => t.length >= 4 && !toks(pageName + ' nasıl kullanılır ne işe yarar nedir özellikleri dozu kullanım miktarı kaç litre ölçüleri ne zaman ekilir bu ürün urun').includes(t) && (IDX && IDX.idf.get(t) || 0) > 6)) hit = { e: pe, sc: 0.75 };
  }
  const log = (o) => db && ctx.waitUntil(db.prepare('INSERT INTO ak_soru (ts, q, qn, kaynak, havuz, skor, cevap, urunler, durum, site, sayfa, giris, cikis) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(new Date().toISOString(), q, norm(q), o.kaynak, o.havuz || null, o.skor ?? null, o.cevap || null, JSON.stringify(o.urunler || []), o.durum || null, site, page, o.giris ?? null, o.cikis ?? null).run().catch(() => {}));

  if (hit) {
    log({ kaynak: 'havuz', havuz: hit.e.i, skor: hit.sc });
    return json({ ok: true, kaynak: 'havuz', id: hit.e.i, cevap: hit.e.c, urunler: hit.e.u, dinamik: hit.e.d || null, bitki: hit.e.b || null });
  }
  // Claude: anahtar yoksa, kapalıysa ya da günlük sınır dolduysa "bilmiyorum + ustaya sor"
  const limit = Number(env.AK_DAILY_LIMIT) || DAILY_LIMIT;
  const off = !aiKey || env.AK_AI === 'off';
  let used = 0;
  if (!off && db) {
    const r = await db.prepare('INSERT INTO ak_gun (d, n) VALUES (?, 1) ON CONFLICT (d) DO UPDATE SET n = n + 1 RETURNING n').bind(today()).first().catch(() => null);
    used = r ? r.n : 0;
  }
  if (off || !db || used > limit) {
    log({ kaynak: 'yok', skor: near[0] ? near[0].sc : null, durum: 'cevapsiz' });
    return json({ ok: true, kaynak: 'yok', cevap: null, urunler: [], neden: off ? 'kapali' : 'sinir' });
  }
  const c = context(q, near, prods);
  let r;
  try { r = await askClaude(env, aiKey, name, q, c, pageName); }
  catch (e) {
    log({ kaynak: 'hata', skor: near[0] ? near[0].sc : null, cevap: String(e && e.status || e && e.message || e).slice(0, 200), durum: 'cevapsiz' });
    return json({ ok: true, kaynak: 'yok', cevap: null, urunler: [], neden: 'hata' });
  }
  if (!r.cevap) {
    log({ kaynak: r.refused ? 'red' : 'hata', durum: 'cevapsiz', giris: r.usage && r.usage.input_tokens, cikis: r.usage && r.usage.output_tokens });
    return json({ ok: true, kaynak: 'yok', cevap: null, urunler: [], neden: r.refused ? 'red' : 'hata' });
  }
  const tok = { giris: r.usage && (r.usage.input_tokens + (r.usage.cache_read_input_tokens || 0) + (r.usage.cache_creation_input_tokens || 0)), cikis: r.usage && r.usage.output_tokens };
  // Yönlendirme ve konu dışı: modelin kısa cümlesi + iletişim düğmeleri
  if (r.durum === 'yonlendir' || r.durum === 'konu_disi') {
    log({ kaynak: 'ai', skor: near[0] ? near[0].sc : null, cevap: r.cevap, durum: r.durum, ...tok });
    return json({ ok: true, kaynak: 'yonlendir', cevap: r.cevap, urunler: [], neden: r.durum });
  }
  // Model kendi cevabından emin değilse cevap gösterilmez (yanlış bilgi riski); müşteri ustaya yönlendirilir.
  // Cevap inceleme için kaydedilir.
  if (!r.emin) {
    log({ kaynak: 'ai', skor: near[0] ? near[0].sc : null, cevap: r.cevap, urunler: r.urunler, durum: 'emin-degil', ...tok });
    return json({ ok: true, kaynak: 'yok', cevap: null, urunler: [], neden: 'emin-degil' });
  }
  log({ kaynak: 'ai', skor: near[0] ? near[0].sc : null, cevap: r.cevap, urunler: r.urunler, durum: 'onay-bekliyor', ...tok });
  return json({ ok: true, kaynak: 'ai', cevap: r.cevap, urunler: r.urunler });
}
