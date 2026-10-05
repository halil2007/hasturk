// Hastürk CRM — Hepsiburada aracı sunucusu (Deno Deploy sürümü: hosting gerekmez, ücretsiz)
// Hepsiburada bazı servislerde panelin çalıştığı Cloudflare sunucularından gelen istekleri 520 hatasıyla kapatıyor.
// Bu dosya Deno Deploy'da (Google Cloud sunucuları, Cloudflare değil) çalışır; panel Hepsiburada isteklerini buradan geçirir.
// hb-proxy.php ile aynı işi yapar: hostinginiz varsa onu, yoksa bunu kullanın.
//
// KURULUM (5 dakika)
//  1) https://deno.com/deploy adresinden GitHub hesabınızla ücretsiz giriş yapın → yeni bir "Playground" oluşturun.
//  2) Editördeki her şeyi silip bu dosyanın tamamını yapıştırın.
//  3) Aşağıdaki KEY değerini uzun, rastgele bir metinle değiştirin (en az 24 karakter; harf + rakam) → kaydedip yayınlayın (Deploy).
//     (İsterseniz KEY'i dosyaya yazmak yerine ayarlardaki ortam değişkenlerine HB_PROXY_KEY adıyla girin.)
//  4) Verilen adresi kopyalayın (ör. https://ornek-ad.deno.dev ya da https://ornek-ad.deno.net).
//  5) Panel → Entegrasyonlar → Hepsiburada → Gelişmiş ayarlar:
//       "Aracı sunucu adresi"   = o adres
//       "Aracı sunucu anahtarı" = KEY ile birebir aynı metin
//     Kaydet → Bağlantıyı test et.
//
// GÜVENLİK: Yalnız https://*.hepsiburada.com adreslerine iletir; doğru anahtar olmadan çalışmaz. Hiçbir şeyi kaydetmez.

const KEY = (globalThis.Deno && Deno.env.get('HB_PROXY_KEY')) || 'BURAYA-UZUN-RASTGELE-BIR-ANAHTAR-YAZIN';

const text = (s, status) => new Response(s, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function handle(req, key = KEY, fetchFn = fetch) {
  if (key === 'BURAYA-UZUN-RASTGELE-BIR-ANAHTAR-YAZIN' || key.length < 24) return text('hb-proxy: KEY degerini degistirin (en az 24 karakter).', 500);
  if (!same(key, req.headers.get('x-proxy-key') || '')) return text('yetkisiz', 403);
  let u;
  try { u = new URL(new URL(req.url).searchParams.get('u') || ''); } catch { return text('izin verilmeyen adres', 400); }
  if (u.protocol !== 'https:' || !/(^|\.)hepsiburada\.com$/i.test(u.hostname)) return text('izin verilmeyen adres', 400);

  // İletilecek başlıklar: kimlik, entegratör adı (User-Agent), içerik türü
  const h = new Headers();
  for (const k of ['authorization', 'accept', 'user-agent']) if (req.headers.has(k)) h.set(k, req.headers.get(k));
  const ct = req.headers.get('x-content-type') || req.headers.get('content-type');
  if (ct) h.set('content-type', ct);
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();

  let r;
  try { r = await fetchFn(u.href, { method: req.method, headers: h, body: body && body.byteLength ? body : undefined, redirect: 'manual' }); }
  catch (e) { return text(`hb-proxy: Hepsiburada baglanti hatasi: ${e.message}`, 502); }
  const out = new Headers({ 'Cache-Control': 'no-store' });
  if (r.headers.get('content-type')) out.set('Content-Type', r.headers.get('content-type'));
  return new Response(r.body, { status: r.status, headers: out });
}

if (globalThis.Deno) Deno.serve((req) => handle(req));
