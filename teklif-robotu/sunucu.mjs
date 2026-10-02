// Yerel arayüz: http://127.0.0.1:3737 — yalnızca bu bilgisayardan erişilir.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Motor } from './motor.mjs';
import { ADAPTORLER, KOK, ayarlariOku, sirketleriOku, veriHazirla, veriKontrol } from './yardimci.mjs';

const ayar = ayarlariOku();
const motor = new Motor(ayar);
const dinleyiciler = new Set();
let sonDurum = null; // sayfa yenilenince son sorgu tekrar görünsün

function yayinla(tur, veri) {
  if (tur === 'basladi') sonDurum = { ...veri, durumlar: {} };
  if (tur === 'durum' && sonDurum) sonDurum.durumlar[veri.kod] = veri;
  const satir = `event: ${tur}\ndata: ${JSON.stringify(veri)}\n\n`;
  for (const res of dinleyiciler) res.write(satir);
}
for (const tur of ['basladi', 'durum', 'bitti', 'hata', 'log']) motor.on(tur, v => yayinla(tur, v));

const TURLER = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json; charset=utf-8' };

function dosyaGonder(res, kok, goreli) {
  const dosya = path.resolve(kok, '.' + path.posix.normalize('/' + goreli));
  if (!dosya.startsWith(path.resolve(kok)) || !fs.existsSync(dosya) || fs.statSync(dosya).isDirectory()) {
    res.writeHead(404).end('Bulunamadı');
    return;
  }
  res.writeHead(200, { 'content-type': TURLER[path.extname(dosya)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(dosya).pipe(res);
}

function json(res, kod, veri) {
  res.writeHead(kod, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(veri));
}

async function govde(req) {
  let s = '';
  for await (const p of req) { s += p; if (s.length > 100_000) throw new Error('çok büyük'); }
  return s ? JSON.parse(s) : {};
}

const sunucu = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    // Tarayıcı dışı sitelerin bu yerel sunucuya istek atmasını engelle
    if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
      return json(res, 403, { hata: 'İzin yok' });
    }
    if (url.pathname === '/') return dosyaGonder(res, path.join(KOK, 'arayuz'), 'index.html');
    if (url.pathname.startsWith('/demo/')) return dosyaGonder(res, path.join(KOK, 'demo'), url.pathname.slice(6));
    if (url.pathname.startsWith('/sonuclar/')) return dosyaGonder(res, path.join(KOK, 'sonuclar'), url.pathname.slice(10));

    if (url.pathname === '/api/sirketler') {
      const liste = sirketleriOku().map(s => ({ ...s, adaptorVar: fs.existsSync(path.join(ADAPTORLER, `${s.kod}.mjs`)) }));
      return json(res, 200, liste);
    }
    if (url.pathname === '/api/olaylar') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(`event: merhaba\ndata: ${JSON.stringify({ calisiyor: motor.calisiyor, sonDurum })}\n\n`);
      dinleyiciler.add(res);
      const nabiz = setInterval(() => res.write(': \n\n'), 20_000);
      req.on('close', () => { clearInterval(nabiz); dinleyiciler.delete(res); });
      return;
    }
    if (url.pathname === '/api/teklif' && req.method === 'POST') {
      const { veri: girdi, sirketler: kodlar } = await govde(req);
      const veri = veriHazirla(girdi);
      if (!veri.tc && !veri.plaka) return json(res, 400, { hata: 'En az T.C./vergi no ya da plaka girin' });
      const tum = sirketleriOku();
      const secili = tum.filter(s => (kodlar?.length ? kodlar.includes(s.kod) : s.aktif));
      if (!secili.length) return json(res, 400, { hata: 'Şirket seçilmedi' });
      if (motor.calisiyor) return json(res, 409, { hata: 'Bir sorgu zaten çalışıyor' });
      motor.teklifTopla(veri, secili); // sonuçlar /api/olaylar üzerinden akar
      return json(res, 202, { tamam: true, uyarilar: veriKontrol(veri) });
    }
    if (url.pathname === '/api/ac' && req.method === 'POST') {
      const { kod } = await govde(req);
      await motor.ac(kod);
      return json(res, 200, { tamam: true });
    }
    res.writeHead(404).end('Bulunamadı');
  } catch (e) {
    json(res, 500, { hata: e.message.split('\n')[0] });
  }
});

sunucu.listen(ayar.port, '127.0.0.1', () => {
  console.log(`Teklif robotu hazır: http://127.0.0.1:${ayar.port}`);
  console.log('Kapatmak için bu pencerede Ctrl+C.');
});

for (const sinyal of ['SIGINT', 'SIGTERM']) {
  process.on(sinyal, async () => { await motor.kapat(); process.exit(0); });
}

export { motor }; // test ve betikler için
