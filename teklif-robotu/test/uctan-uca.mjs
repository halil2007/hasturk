// Uçtan uca deneme: iki demo portalda giriş bekleme, teklif alma, oturumun
// ikinci sorguda korunması, fiyat okuma, kayıt dönüştürücü ve yerel API.
//   npm test                 (Windows/Mac: tarayıcı penceresi açılır)
//   xvfb-run -a npm test     (ekransız Linux)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3799;
const gecici = fs.mkdtempSync(path.join(os.tmpdir(), 'teklif-test-'));
process.env.TEKLIF_PORT = String(PORT);
process.env.TEKLIF_PROFIL = path.join(gecici, 'profil-motor');

const { KOK, ayarlariOku, aracDuzelt, aracOzet, tcGecerliMi, tutarCevir, veriHazirla } = await import('../yardimci.mjs');
const { Motor } = await import('../motor.mjs');
const { donustur } = await import('../kaydet.mjs');

let gecen = 0;
const dene = async (ad, fn) => { await fn(); gecen++; console.log('  ✓', ad); };

console.log('Yardımcılar');
await dene('TC doğrulama', () => {
  assert.equal(tcGecerliMi('10000000146'), true);
  assert.equal(tcGecerliMi('12345678901'), false);
});
await dene('tutar çevirme', () => {
  assert.equal(tutarCevir('4.312,75 TL'), 4312.75);
  assert.equal(tutarCevir('3255.00'), 3255);
  assert.equal(tutarCevir('12.500'), 12500);
});
await dene('veri hazırlama', () => {
  const v = veriHazirla({ tc: '100 000 001 46', plaka: '34 abc 123', dogumTarihi: '1985-2-1' });
  assert.equal(v.tc, '10000000146');
  assert.deepEqual([v.plaka, v.plakaIl, v.plakaHarf, v.plakaNo], ['34ABC123', '34', 'ABC', '123']);
  assert.equal(v.dogumTarihi, '01.02.1985');
  assert.equal(v.dogumTarihiISO, '1985-02-01');
});
await dene('araç bilgisi düzeltme ve özet', () => {
  const a = aracDuzelt({ marka: ' renault ', modelYili: 'Model 2018 ', koltuk: '5 kişi', saseNo: 'nm 123 abc' });
  assert.equal(a.marka, 'renault');
  assert.equal(a.modelYili, '2018');
  assert.equal(a.koltuk, '5');
  assert.equal(a.saseNo, 'NM123ABC');
  assert.equal(aracOzet({ marka: 'RENAULT', model: 'CLIO', modelYili: '2018', koltuk: '5' }), 'RENAULT CLIO 2018 · 5 koltuk');
});
await dene('kayıt dönüştürücü (şifre satırı atılır, örnekler veriye bağlanır)', () => {
  const kayit = `const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  await page.getByLabel('Şifre').fill('gizli123');
  await page.getByLabel('TCKN').fill('10000000146');
  await page.getByLabel('Plaka İl').selectOption('34');
  await page.getByLabel('Plaka').fill('34 ABC 123');
  await page.getByRole('button', { name: 'Hesapla' }).click();

  // ---------------------
  await context.close();
  await browser.close();
})();`;
  const { dosya, atilan, degisen } = donustur({ kod: 'x', ad: 'X', adres: 'https://x', kayit, ornekler: { tc: '10000000146', plaka: '34 ABC 123', plakaIl: '34' } });
  assert.equal(atilan.length, 1);
  assert.ok(!dosya.includes('gizli123'));
  assert.ok(dosya.includes(".fill(veri.tc)") && dosya.includes(".fill(veri.plaka)") && dosya.includes("selectOption(veri.plakaIl)"));
  assert.deepEqual(degisen.sort(), ['plaka', 'plakaIl', 'tc']);
  assert.ok(!dosya.includes('chromium') && !dosya.includes('context.close'));
});

// Demo portalları ve API için sunucu (gizli modda: oturumsuz şirket "hata" vermeli)
const sunucu = spawn(process.execPath, [path.join(KOK, 'sunucu.mjs')], {
  env: { ...process.env, TEKLIF_PROFIL: path.join(gecici, 'profil-sunucu'), TEKLIF_GIZLI: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((ok, red) => {
  sunucu.stdout.on('data', d => String(d).includes('hazır') && ok());
  sunucu.on('exit', k => red(new Error('sunucu kapandı: ' + k)));
});
const B = `http://127.0.0.1:${PORT}`;

try {
  console.log('Motor (iki demo portal)');
  const motor = new Motor({ ...ayarlariOku(), gizli: false, esZamanli: 2, girisBeklemeDk: 1 });
  const girisler = [];
  const girisYap = async kod => {
    girisler.push(kod);
    const p = motor.sekmeler.get(kod);
    if (kod === 'demo-a') { await p.fill('input[name=kullanici]', 'acente'); await p.fill('input[type=password]', 'x'); await p.click('text=Giriş'); }
    if (kod === 'demo-b') { await p.fill('#ep', 'a@b'); await p.fill('#pw', 'x'); await p.click('#girisYap'); }
  };
  motor.on('durum', d => d.durum === 'giris-bekleniyor' && girisYap(d.kod));
  let egmSonuc = null;
  motor.on('egm', d => { if (d.durum === 'giris-bekleniyor') girisYap(d.kod); if (d.durum === 'tamam') egmSonuc = d; });
  const veri = veriHazirla({ tc: '10000000146', dogumTarihi: '01.02.1985', plaka: '34ABC123', belgeSeri: 'AB', belgeNo: '123456' });
  const sirketler = [{ kod: 'demo-a', ad: 'A', egm: true }, { kod: 'demo-b', ad: 'B' }];

  const kontrol = sonuclar => {
    const a = sonuclar.find(s => s.kod === 'demo-a');
    const b = sonuclar.find(s => s.kod === 'demo-b');
    assert.equal(a.durum, 'tamam', JSON.stringify(a));
    assert.equal(b.durum, 'tamam', JSON.stringify(b));
    assert.ok(a.fiyat > 3000 && a.fiyat < 5001 && Math.round((a.fiyat % 1) * 100) === 75, 'A brüt prim (vergi değil): ' + a.fiyat);
    assert.ok(b.fiyat > 2500 * 1.05 - 1 && b.fiyat < 4300 * 1.05, 'B ödenecek: ' + b.fiyat);
    assert.ok(fs.existsSync(path.join(KOK, a.ekran)), 'ekran görüntüsü');
    return [a.fiyat, b.fiyat];
  };
  let ilk;
  await dene('ilk sorgu: EGM araç bilgisi gelir, tüm şirketlere aktarılır', async () => {
    ilk = kontrol(await motor.teklifTopla(veri, sirketler));
    assert.deepEqual(girisler.sort(), ['demo-a', 'demo-b']);
    assert.ok(egmSonuc?.arac?.marka && egmSonuc.arac.model, 'EGM marka/model: ' + JSON.stringify(egmSonuc));
    assert.equal(egmSonuc.arac.modelYili.length, 4, 'model yılı 4 hane');
    assert.equal(egmSonuc.arac.koltuk, '5');
    assert.ok(/^NM/.test(egmSonuc.arac.saseNo), 'şase no');
    assert.deepEqual(veri.arac, egmSonuc.arac, 'araç bilgisi tüm şirketlere aktarıldı');
  });
  await dene('ikinci sorgu: oturum korunur, tekrar giriş istenmez', async () => {
    girisler.length = 0;
    assert.deepEqual(kontrol(await motor.teklifTopla(veri, sirketler)), ilk);
    assert.equal(girisler.length, 0);
  });
  await motor.kapat();

  console.log('Yerel API');
  await dene('şirket listesi', async () => {
    const l = await (await fetch(B + '/api/sirketler')).json();
    assert.ok(l.some(s => s.kod === 'demo-a' && s.adaptorVar));
  });
  await dene('boş form reddedilir, dış siteden istek reddedilir', async () => {
    assert.equal((await fetch(B + '/api/teklif', { method: 'POST', body: '{}' })).status, 400);
    assert.equal((await fetch(B + '/api/teklif', { method: 'POST', body: '{}', headers: { origin: 'https://kotu.example' } })).status, 403);
  });
  await dene('canlı durum akışı: oturumsuz gizli modda anlaşılır hata', async () => {
    const ac = new AbortController();
    const akis = await fetch(B + '/api/olaylar', { signal: ac.signal });
    const okuyucu = akis.body.getReader();
    const r = await fetch(B + '/api/teklif', { method: 'POST', body: JSON.stringify({ veri: { tc: '10000000146' }, sirketler: ['demo-a'] }) });
    assert.equal(r.status, 202);
    let metin = '';
    while (!metin.includes('event: bitti')) metin += new TextDecoder().decode((await okuyucu.read()).value);
    ac.abort();
    assert.match(metin, /Oturum kapal/);
  });
} finally {
  sunucu.kill();
  fs.rmSync(gecici, { recursive: true, force: true });
}
console.log(`\n${gecen} deneme geçti.`);
process.exit(0);
