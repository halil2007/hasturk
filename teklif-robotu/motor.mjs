// Teklif motoru: tek tarayıcı, her şirket için bir sekme. Sekmeler sunucu
// çalıştığı sürece açık kalır; böylece bir kez giriş yapılan portal sonraki
// sorgularda tekrar şifre/SMS istemez.
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ADAPTORLER, KOK, aracDuzelt, aracOzet, fiyatBul, girisSayfasiMi, tarayiciAc } from './yardimci.mjs';

export class Motor extends EventEmitter {
  constructor(ayar) {
    super();
    this.ayar = ayar;
    this.context = null;
    this.acilis = null;
    this.sekmeler = new Map();
    this.calisiyor = false;
  }

  async tarayici() {
    if (this.context) return this.context;
    this.acilis ??= tarayiciAc(this.ayar).then(ctx => {
      ctx.on('close', () => { this.context = null; this.sekmeler.clear(); });
      this.context = ctx;
      return ctx;
    }).finally(() => { this.acilis = null; });
    return this.acilis;
  }

  async sekme(kod) {
    const ctx = await this.tarayici();
    let page = this.sekmeler.get(kod);
    if (!page || page.isClosed()) {
      const kullanilan = new Set(this.sekmeler.values());
      page = ctx.pages().find(p => p.url() === 'about:blank' && !kullanilan.has(p)) || await ctx.newPage();
      this.sekmeler.set(kod, page);
    }
    return page;
  }

  // Adaptör dosyası her sorguda yeniden okunur: düzenleme yapınca
  // robotu kapatıp açmaya gerek kalmaz.
  async adaptor(kod) {
    const dosya = path.join(ADAPTORLER, `${kod}.mjs`);
    if (!fs.existsSync(dosya)) throw new Error(`Adaptör yok: adaptorler/${kod}.mjs (önce kaydedin)`);
    const a = await import(pathToFileURL(dosya).href + '?v=' + fs.statSync(dosya).mtimeMs);
    if (!a.adres || typeof a.teklifAl !== 'function') throw new Error(`${kod}.mjs içinde "adres" ve "teklifAl" olmalı`);
    return a;
  }

  // Şirket sekmesini açar (elle giriş yapmak ya da bakmak için)
  async ac(kod) {
    const a = await this.adaptor(kod);
    const page = await this.sekme(kod);
    await page.goto(a.adres, { waitUntil: 'domcontentloaded' });
    await page.bringToFront();
  }

  async teklifTopla(veri, sirketler) {
    if (this.calisiyor) throw new Error('Bir sorgu zaten çalışıyor');
    this.calisiyor = true;
    const klasor = path.join(KOK, 'sonuclar', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
    fs.mkdirSync(klasor, { recursive: true });
    const sonuclar = [];
    this.emit('basladi', { sirketler: sirketler.map(s => ({ kod: s.kod, ad: s.ad })), klasor: path.relative(KOK, klasor) });
    try {
      await this.tarayici();
      await this.egmAsamasi(veri, sirketler, klasor);
      const kuyruk = [...sirketler];
      const isci = async () => {
        while (kuyruk.length) sonuclar.push(await this.tekSirket(kuyruk.shift(), veri, klasor));
      };
      await Promise.all(Array.from({ length: Math.min(this.ayar.esZamanli || 4, kuyruk.length) }, isci));
      // Kişisel veri dosyaya yazılmaz; sadece araç bilgisi, fiyatlar ve plaka.
      fs.writeFileSync(path.join(klasor, 'sonuc.json'), JSON.stringify({ brans: veri.brans, plaka: veri.plaka, arac: veri.arac, sonuclar }, null, 2));
    } catch (e) {
      this.emit('hata', { hata: e.message });
    } finally {
      this.calisiyor = false;
      this.emit('bitti', { sonuclar });
    }
    return sonuclar;
  }

  // EGM sorgusu: sirketler.json'da "egm": true olan ilk şirketten (adaptörü
  // egmSorgu veriyorsa) araç bilgisini bir kez alır, veri.arac'a yazar ve tüm
  // şirketlere aktarır. EGM kaynağı yoksa ya da başarısızsa atlanır; o zaman
  // her şirket plaka+belge ile kendi EGM'ini yapar.
  async egmAsamasi(veri, sirketler, klasor) {
    const kaynak = sirketler.find(s => s.egm);
    if (!kaynak) return;
    this.emit('egm', { durum: 'basladi', kod: kaynak.kod, ad: kaynak.ad });
    try {
      const a = await this.adaptor(kaynak.kod);
      if (typeof a.egmSorgu !== 'function') { this.emit('egm', { durum: 'atlandi', not: `${kaynak.ad} adaptörü EGM sorgusu yapmıyor` }); return; }
      const page = await this.sekme(kaynak.kod);
      page.setDefaultTimeout((this.ayar.adimZamanAsimiSn || 30) * 1000);
      await page.goto(a.adres, { waitUntil: 'domcontentloaded' });
      await this.girisBekle(page, a, (durum, ek) => this.emit('egm', { durum, kod: kaynak.kod, ad: kaynak.ad, ...ek }));
      this.emit('egm', { durum: 'calisiyor', kod: kaynak.kod, ad: kaynak.ad });
      const arac = { bekle: ms => page.waitForTimeout(ms), log: m => this.emit('log', { kod: kaynak.kod, mesaj: m }) };
      const ham = await zamanAsimi(a.egmSorgu(page, veri, arac), (this.ayar.sirketZamanAsimiSn || 150) * 1000);
      veri.arac = aracDuzelt(ham);
      if (!veri.arac.marka && !veri.arac.model) throw new Error('Araç bilgisi okunamadı');
      this.emit('egm', { durum: 'tamam', kod: kaynak.kod, ad: kaynak.ad, arac: veri.arac, ozet: aracOzet(veri.arac) });
    } catch (e) {
      this.emit('egm', { durum: 'hata', kod: kaynak.kod, ad: kaynak.ad, hata: kisalt(e.message) });
      // Araç bilgisi gelmese de şirket sorguları denenecek
    }
  }

  async tekSirket(sirket, veri, klasor) {
    const t0 = Date.now();
    const sonuc = { kod: sirket.kod, ad: sirket.ad };
    const bildir = (durum, ek = {}) => {
      Object.assign(sonuc, { durum, ...ek, sure: Math.round((Date.now() - t0) / 1000) });
      this.emit('durum', { ...sonuc });
    };
    let page;
    try {
      bildir('basladi');
      const a = await this.adaptor(sirket.kod);
      page = await this.sekme(sirket.kod);
      page.setDefaultTimeout((this.ayar.adimZamanAsimiSn || 30) * 1000);
      await page.goto(a.adres, { waitUntil: 'domcontentloaded' });
      await this.girisBekle(page, a, bildir);
      bildir('calisiyor');
      const arac = { fiyatBul, bekle: ms => page.waitForTimeout(ms), log: m => this.emit('log', { kod: sirket.kod, mesaj: m }) };
      const s = await zamanAsimi(a.teklifAl(page, veri, arac), (this.ayar.sirketZamanAsimiSn || 150) * 1000);
      const fiyat = s?.fiyat ?? null;
      const ekran = await this.ekranAl(page, klasor, sirket.kod);
      bildir(fiyat ? 'tamam' : 'fiyat-yok', { fiyat, fiyatMetni: s?.fiyatMetni || '', not: s?.not || '', ekran });
    } catch (e) {
      const ekran = page ? await this.ekranAl(page, klasor, sirket.kod) : null;
      bildir('hata', { hata: kisalt(e.message), ekran });
    }
    return sonuc;
  }

  async girisBekle(page, a, bildir) {
    const gerekli = () => (a.girisGerekliMi ? a.girisGerekliMi(page).catch(() => true) : girisSayfasiMi(page));
    if (!(await gerekli())) return;
    if (this.ayar.gizli) throw new Error('Oturum kapalı. Gizli mod kapalıyken bir kez giriş yapın.');
    bildir('giris-bekleniyor');
    await page.bringToFront().catch(() => {});
    const son = Date.now() + (this.ayar.girisBeklemeDk || 5) * 60_000;
    while (await gerekli()) {
      if (page.isClosed()) throw new Error('Sekme kapatıldı');
      if (Date.now() > son) throw new Error('Giriş yapılmadı (süre doldu)');
      await page.waitForTimeout(1500).catch(() => {});
    }
    await page.goto(a.adres, { waitUntil: 'domcontentloaded' });
    if (await gerekli()) throw new Error('Giriş sonrası teklif sayfası açılamadı');
  }

  async ekranAl(page, klasor, kod) {
    try {
      const dosya = path.join(klasor, `${kod}.png`);
      await page.screenshot({ path: dosya, fullPage: true, timeout: 10_000 });
      return path.relative(KOK, dosya).split(path.sep).join('/');
    } catch {
      return null;
    }
  }

  async kapat() {
    await this.context?.close().catch(() => {});
  }
}

function zamanAsimi(soz, ms) {
  let t;
  return Promise.race([
    soz.finally(() => clearTimeout(t)),
    new Promise((_, red) => { t = setTimeout(() => red(new Error(`Zaman aşımı (${ms / 1000} sn)`)), ms); }),
  ]);
}

function kisalt(mesaj) {
  return String(mesaj).split('\n').find(Boolean)?.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 300) || 'Bilinmeyen hata';
}
