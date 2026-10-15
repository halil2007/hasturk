// Bilge Bey inceleme sayfası ve haftalık rapor.
//   GET  /ak/inceleme          şifreli sayfa (yalnız mağaza sahibi): beğenilmeyen, cevaplanamayan sorular ve onay bekleyen
//                              Claude cevapları. Onaylanan cevap hazır cevaplara katılır (sonraki aynı soruda ücretsiz).
//   POST /ak/inceleme/veri     {k} → listeler          POST /ak/inceleme/karar {k, id, karar, cevap?}
//   GET  /ak/rapor?gun=7       yalnız sayılar (müşteri metni yok): soru, hazır cevap / Claude, maliyet, oy, sepete ekleme
// Şifre Cloudflare'de gizli değişken olarak durur: AK_PANEL_KEY (tanımlı değilse sayfa kapalıdır). Depo herkese açık
// olduğu için müşteri soruları hiçbir zaman depoya ya da GitHub kayıtlarına yazılmaz.
import HAVUZ from './akbilge-havuz.json';
import { initDb } from './akbilge.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const gunOnce = (n) => new Date(Date.now() + 3 * 3600e3 - n * 864e5).toISOString().slice(0, 10);
const HAVUZ_ID = new Map(HAVUZ.map((e) => [e.i, e]));

async function hash(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
async function yetkili(env, k) {
  const anahtar = String(env.AK_PANEL_KEY || '');
  if (anahtar.length < 8 || typeof k !== 'string' || !k || k.length > 200) return false;
  return (await hash(k)) === (await hash(anahtar));
}

// ---------- Sayılar (herkese açık, müşteri metni yok) ----------
export async function rapor(env, url) {
  if (!env.DB) return json({ ok: false, why: 'db' });
  await initDb(env.DB).catch(() => {});
  const gun = Math.min(90, Math.max(1, parseInt(url.searchParams.get('gun'), 10) || 7)), bas = gunOnce(gun);
  const db = env.DB, al = (sql, ...b) => db.prepare(sql).bind(...b).all().then((r) => r.results).catch(() => []);
  const [satir, oy, ka, kaUrun, havuz] = await Promise.all([
    al("SELECT kaynak, COALESCE(durum,'') AS durum, COUNT(*) AS n, SUM(COALESCE(giris,0)) AS giris, SUM(COALESCE(cikis,0)) AS cikis FROM ak_soru WHERE substr(ts,1,10) >= ? GROUP BY kaynak, durum", bas),
    al('SELECT oy, COUNT(*) AS n FROM ak_oy WHERE substr(ts,1,10) >= ? GROUP BY oy', bas),
    al("SELECT SUM(n) AS n FROM ev WHERE k = 'ka' AND d >= ?", bas),
    al("SELECT x, SUM(n) AS n FROM ev WHERE k = 'ka' AND d >= ? GROUP BY x ORDER BY n DESC LIMIT 5", bas),
    al("SELECT havuz, COUNT(*) AS n FROM ak_soru WHERE kaynak = 'havuz' AND substr(ts,1,10) >= ? GROUP BY havuz ORDER BY n DESC", bas),
  ]);
  const ai = satir.filter((r) => r.kaynak === 'ai'), giris = ai.reduce((a, r) => a + r.giris, 0), cikis = ai.reduce((a, r) => a + r.cikis, 0);
  const konu = {};
  for (const r of havuz) { const e = HAVUZ_ID.get(r.havuz); const t = e ? e.t : 'diger'; konu[t] = (konu[t] || 0) + r.n; }
  return json({
    ok: true, gun, baslangic: bas,
    toplam: satir.reduce((a, r) => a + r.n, 0),
    hazir: satir.filter((r) => r.kaynak === 'havuz' || r.kaynak === 'havuz-ai').reduce((a, r) => a + r.n, 0),
    claude: ai.reduce((a, r) => a + r.n, 0),
    cevapsiz: satir.filter((r) => r.durum === 'cevapsiz' || r.durum === 'emin-degil' || r.durum === 'yonlendir').reduce((a, r) => a + r.n, 0),
    tahmini_usd: +((giris * 4 + cikis * 20) / 1e6).toFixed(3),
    oy: { evet: (oy.find((r) => r.oy === 1) || {}).n || 0, hayir: (oy.find((r) => r.oy === 0) || {}).n || 0 },
    sepete_eklenen: (ka[0] && ka[0].n) || 0, sepete_en_cok: kaUrun.map((r) => ({ urun: r.x, n: r.n })),
    // Soru metni yerine hazır cevabın kendi kalıbı gösterilir (müşterinin yazdığı metin değil)
    en_cok_konular: havuz.slice(0, 10).map((r) => ({ soru: (HAVUZ_ID.get(r.havuz) || { s: ['(eski kayıt)'] }).s[0], n: r.n })),
    konu_turleri: konu,
  });
}

// ---------- Şifreli inceleme ----------
export async function veri(req, env) {
  let b; try { b = await req.json(); } catch { return json({ ok: false }, 400); }
  if (!(await yetkili(env, b.k))) return json({ ok: false, why: 'sifre' }, 403);
  if (!env.DB) return json({ ok: false, why: 'db' });
  await initDb(env.DB).catch(() => {});
  const bas = gunOnce(30), db = env.DB, al = (sql, ...x) => db.prepare(sql).bind(...x).all().then((r) => r.results).catch(() => []);
  const [bekleyen, hayir, cevapsiz] = await Promise.all([
    al("SELECT id, ts, q, cevap, urunler FROM ak_soru WHERE kaynak = 'ai' AND durum = 'onay-bekliyor' AND substr(ts,1,10) >= ? ORDER BY id DESC LIMIT 100", bas),
    al('SELECT ts, q, kaynak, havuz FROM ak_oy WHERE oy = 0 AND substr(ts,1,10) >= ? ORDER BY id DESC LIMIT 100', bas),
    al("SELECT id, ts, q, kaynak, durum, cevap FROM ak_soru WHERE durum IN ('cevapsiz','emin-degil','yonlendir') AND substr(ts,1,10) >= ? ORDER BY id DESC LIMIT 150", bas),
  ]);
  const sonuc = await rapor(env, new URL('http://x/?gun=7')).then((r) => r.json());
  return json({ ok: true, ozet: sonuc, bekleyen, hayir: hayir.map((r) => ({ ...r, hazir: r.havuz && HAVUZ_ID.get(r.havuz) ? HAVUZ_ID.get(r.havuz).c.slice(0, 400) : null })), cevapsiz });
}
export async function karar(req, env) {
  let b; try { b = await req.json(); } catch { return json({ ok: false }, 400); }
  if (!(await yetkili(env, b.k))) return json({ ok: false, why: 'sifre' }, 403);
  const id = parseInt(b.id, 10), k = b.karar === 'onaylandi' ? 'onaylandi' : b.karar === 'reddedildi' ? 'reddedildi' : null;
  if (!id || !k || !env.DB) return json({ ok: false }, 400);
  const cevap = typeof b.cevap === 'string' && b.cevap.trim().length >= 10 ? b.cevap.trim().slice(0, 3000) : null;
  await env.DB.prepare('UPDATE ak_soru SET durum = ?, cevap = COALESCE(?, cevap) WHERE id = ? AND kaynak = \'ai\'').bind(k, k === 'onaylandi' ? cevap : null, id).run();
  return json({ ok: true });
}

export function sayfa(env) {
  const acik = String(env.AK_PANEL_KEY || '').length >= 8;
  return new Response(SAYFA.replace('__ACIK__', acik ? '1' : ''), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' } });
}

const SAYFA = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Bilge Bey inceleme</title><style>
:root{--pr:#0b5d73;--prd:#07404f;--soft:#e8f3f6;--ln:#e3e8eb;--ink:#14212b;--mu:#66737c;--ok:#1f8a5b;--ac:#d7372f}
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--ink);background:#f3f6f7}
main{max-width:860px;margin:0 auto;padding:16px}h1{font-size:22px;color:var(--prd);margin:6px 0 4px}h2{font-size:17px;color:var(--prd);margin:26px 0 4px}
.not{color:var(--mu);font-size:14px;margin:0 0 10px}.kart{background:#fff;border:1px solid var(--ln);border-radius:14px;padding:12px 14px;margin:8px 0}
.q{font-weight:700}.ts{font-size:12px;color:var(--mu)}textarea{width:100%;min-height:120px;font:inherit;font-size:14px;border:1px solid var(--ln);border-radius:10px;padding:8px;margin:8px 0}
button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:9px 14px;cursor:pointer}.on{background:var(--ok);color:#fff}.red{background:#fff;border:1.5px solid var(--ln);color:var(--ink);margin-left:6px}
.giris{background:#fff;border:1px solid var(--ln);border-radius:14px;padding:16px;max-width:380px}.giris input{width:100%;font:inherit;padding:10px;border:1px solid var(--ln);border-radius:10px;margin:8px 0}
.giris button{background:var(--pr);color:#fff;width:100%}.oz{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}.oz div{background:#fff;border:1px solid var(--ln);border-radius:12px;padding:10px}
.oz b{display:block;font-size:20px;color:var(--prd)}.oz span{font-size:12.5px;color:var(--mu)}.bos{color:var(--mu);font-size:14px}.hz{font-size:13px;color:var(--mu);white-space:pre-wrap;margin-top:6px}
</style></head><body><main><h1>Bilge Bey inceleme</h1><p class="not">Müşteri soruları yalnız burada görünür. Onayladığınız cevap Bilge Bey'in hazır cevaplarına eklenir; aynı soru bir daha sorulduğunda ücretsiz ve anında gelir.</p><div id="app"></div></main>
<script>
var ACIK='__ACIK__',K='';try{K=sessionStorage.getItem('bb-k')||''}catch(e){}
var app=document.getElementById('app');
function e(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function t(s){try{return new Date(s).toLocaleString('tr-TR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}catch(x){return s}}
function giris(m){app.innerHTML=ACIK?'<form class="giris" id="f"><b>Şifre</b>'+(m?'<p class="not" style="color:var(--ac)">'+e(m)+'</p>':'')+'<input type="password" id="k" autocomplete="current-password" required><button>Gir</button></form>':'<div class="giris"><b>Sayfa kapalı</b><p class="not">Açmak için Cloudflare → Workers → hasturk-arama → Settings → Variables and Secrets bölümüne AK_PANEL_KEY adında, en az 8 karakterli gizli (Secret) bir şifre ekleyin.</p></div>';
var f=document.getElementById('f');if(f)f.onsubmit=function(ev){ev.preventDefault();K=document.getElementById('k').value;try{sessionStorage.setItem('bb-k',K)}catch(x){}yukle()}}
function post(u,o){o.k=K;return fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(o)}).then(function(r){return r.json()})}
function yukle(){app.innerHTML='<p class="not">Yükleniyor…</p>';post('/ak/inceleme/veri',{}).then(function(d){if(!d.ok){try{sessionStorage.removeItem('bb-k')}catch(x){}return giris(d.why==='sifre'?'Şifre yanlış.':'Bir sorun oldu.')}ciz(d)},function(){giris('Bağlantı sorunu.')})}
function ciz(d){var o=d.ozet||{},h='<h2>Son 7 gün</h2><div class="oz">'+
[[o.toplam,'soru'],[o.hazir,'hazır cevaptan (ücretsiz)'],[o.claude,"Claude'dan"],['$'+(o.tahmini_usd||0),'tahmini maliyet'],[o.sepete_eklenen,'Bilge Bey önerisinden sepete eklenen'],[(o.oy||{}).evet+' / '+(o.oy||{}).hayir,'işe yaradı: evet / hayır']].map(function(x){return '<div><b>'+e(x[0])+'</b><span>'+e(x[1])+'</span></div>'}).join('')+'</div>';
h+='<h2>Onay bekleyen Claude cevapları ('+d.bekleyen.length+')</h2><p class="not">Doğruysa onaylayın (isterseniz önce düzeltin). Yanlışsa reddedin; bir daha kullanılmaz.</p>';
h+=d.bekleyen.length?d.bekleyen.map(function(r){return '<div class="kart" id="b'+r.id+'"><div class="q">'+e(r.q)+'</div><div class="ts">'+t(r.ts)+'</div><textarea id="c'+r.id+'">'+e(r.cevap)+'</textarea><button class="on" data-id="'+r.id+'" data-k="onaylandi">Onayla</button><button class="red" data-id="'+r.id+'" data-k="reddedildi">Reddet</button></div>'}).join(''):'<p class="bos">Bekleyen cevap yok.</p>';
h+='<h2>Müşterinin "işime yaramadı" dediği cevaplar ('+d.hayir.length+')</h2><p class="not">Bunları bana iletirseniz cevabı düzeltirim.</p>';
h+=d.hayir.length?d.hayir.map(function(r){return '<div class="kart"><div class="q">'+e(r.q)+'</div><div class="ts">'+t(r.ts)+' · '+e(r.kaynak==='havuz'?'hazır cevap':r.kaynak)+'</div>'+(r.hazir?'<div class="hz">'+e(r.hazir)+'</div>':'')+'</div>'}).join(''):'<p class="bos">Yok.</p>';
h+='<h2>Cevaplanamayan sorular ('+d.cevapsiz.length+')</h2><p class="not">Bilge Bey bu sorularda müşteriyi size yönlendirdi. Sık tekrar edenleri hazır cevaplara ekleyebiliriz.</p>';
h+=d.cevapsiz.length?d.cevapsiz.map(function(r){return '<div class="kart"><div class="q">'+e(r.q)+'</div><div class="ts">'+t(r.ts)+' · '+e({cevapsiz:'cevap bulunamadı','emin-degil':'emin olamadı',yonlendir:'yönlendirdi'}[r.durum]||r.durum)+'</div></div>'}).join(''):'<p class="bos">Yok.</p>';
app.innerHTML=h;
[].forEach.call(app.querySelectorAll('button[data-id]'),function(b){b.onclick=function(){var id=b.getAttribute('data-id'),k=b.getAttribute('data-k'),c=document.getElementById('c'+id);b.disabled=true;post('/ak/inceleme/karar',{id:id,karar:k,cevap:c?c.value:''}).then(function(r){var kart=document.getElementById('b'+id);if(r.ok&&kart)kart.innerHTML='<div class="q">'+(k==='onaylandi'?'Onaylandı ✓ Hazır cevaplara eklendi.':'Reddedildi.')+'</div>';else b.disabled=false})}})}
if(K)yukle();else giris();
</script></body></html>`;
