// Bir şirketin teklif ekranını bir kez elle doldurarak "öğretir".
//   node kaydet.mjs                      → soru sorarak ilerler
//   node kaydet.mjs anadolu "Anadolu Sigorta" https://portal-adresi
// Siz giriş yapıp teklif ekranına gelince kayıt başlar; yaptığınız tıklama ve
// yazmalar adaptorler/<kod>.mjs dosyasına dönüştürülür. Kayıtta yazdığınız
// örnek değerler (TC, plaka...) otomatik olarak veri.tc, veri.plaka... olur.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { ADAPTORLER, KOK, ayarlariOku, sirketleriOku, sirketleriYaz, tarayiciAc, veriHazirla } from './yardimci.mjs';

// Kayıtta yazılan örnek değerler hangi alana karşılık geliyor
export const ALANLAR = [
  ['tc', 'T.C. / vergi no'],
  ['dogumTarihi', 'Doğum tarihi (GG.AA.YYYY)'],
  ['plaka', 'Plaka'],
  ['belgeSeri', 'Belge/ruhsat seri'],
  ['belgeNo', 'Belge/ruhsat no'],
  ['telefon', 'Cep telefonu'],
  ['eposta', 'E-posta'],
];

const SIFRE = /(şifre|sifre|parola|password|passwd|pass\b|otp|sms\s*kod|doğrulama\s*kod)/i;

// Playwright kaydını adaptör dosyasına çevirir.
export function donustur({ kod, ad, adres, kayit, ornekler }) {
  // Hazır kalıp satırlarından ("newContext"/"newPage") sonra, kapanış çizgisine kadar olan adımlar
  const satirlar = kayit.split('\n');
  const bas = satirlar.findLastIndex(s => /browser\.newContext\(|context\.newPage\(\)/.test(s));
  const son = satirlar.findIndex((s, i) => i > bas && /^\s*\/\/ -{5,}/.test(s));
  let adimlar = satirlar.slice(bas + 1, son === -1 ? undefined : son)
    .map(s => s.replace(/^ {2}/, ''))
    .filter(s => s.trim() && !/^\s*await (context|browser)\.close\(\)/.test(s));

  const atilan = [];
  adimlar = adimlar.filter(s => {
    if (/\.(fill|type|pressSequentially)\(/.test(s) && SIFRE.test(s)) { atilan.push(s.trim()); return false; }
    return true;
  });
  // Kayıtta zaten açık olan sayfaya yeniden gitmeye gerek yok
  adimlar = adimlar.filter(s => !/^\s*await page\.goto\(/.test(s) || !s.includes(JSON.stringify(adres).slice(1, -1)));

  // Örnek değerleri veri alanlarıyla değiştir (uzun değerler önce)
  const esler = Object.entries(ornekler)
    .filter(([, v]) => v && String(v).length >= 2)
    .sort((a, b) => String(b[1]).length - String(a[1]).length);
  const degisen = new Set();
  adimlar = adimlar.map(s => {
    for (const [alan, deger] of esler) {
      const kacis = String(deger).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const r = new RegExp(`(['"\`])${kacis}\\1`, 'g');
      if (r.test(s)) { s = s.replace(r, `veri.${alan}`); degisen.add(alan); }
    }
    return s;
  });

  const govde = adimlar.map(s => '  ' + s).join('\n');
  const dosya = `// ${ad} — ${new Date().toLocaleString('tr-TR')} tarihinde kaydedildi.
// Gözden geçirin: sabit kalmış örnek değer, gereksiz tıklama ya da açılır
// pencere (page1) adımı varsa düzeltin. Değişiklik bir sonraki sorguda geçerli olur.
//   veri: brans, tc, dogumTarihi, dogumTarihiISO, plaka, plakaIl, plakaHarf,
//         plakaNo, belgeSeri, belgeNo, telefon, eposta
export const adres = ${JSON.stringify(adres)};

// Fiyatın yazdığı alanın seçicisi (örn. '#odenecek'). Boş bırakılırsa
// sayfadaki "Brüt prim / Ödenecek" satırı otomatik bulunur.
export const fiyatSecici = null;

export async function teklifAl(page, veri, arac) {
${govde}
  await arac.bekle(1500); // fiyatın ekrana gelmesi için
  return arac.fiyatBul(page, fiyatSecici);
}
`;
  return { dosya, atilan, degisen: [...degisen] };
}

// Kaydı açık bir tarayıcı sekmesinde başlatır; durdur() ile kayıt metnini döndürür.
export async function kayitBaslat(context, ciktiDosyasi) {
  fs.mkdirSync(path.dirname(ciktiDosyasi), { recursive: true });
  fs.rmSync(ciktiDosyasi, { force: true });
  await context._enableRecorder({ language: 'javascript', mode: 'recording', outputFile: ciktiDosyasi, handleSIGINT: false });
  return async () => {
    await new Promise(r => setTimeout(r, 800)); // kayıt dosyası 250 ms aralıkla yazılır
    await context._disableRecorder().catch(() => {});
    return fs.existsSync(ciktiDosyasi) ? fs.readFileSync(ciktiDosyasi, 'utf8') : '';
  };
}

export function adaptorYaz(kod, ad, icerik) {
  const hedef = path.join(ADAPTORLER, `${kod}.mjs`);
  if (fs.existsSync(hedef)) fs.copyFileSync(hedef, hedef + '.yedek');
  fs.writeFileSync(hedef, icerik);
  const liste = sirketleriOku();
  const var_ = liste.find(s => s.kod === kod);
  if (var_) var_.ad = ad; else liste.push({ kod, ad, aktif: true });
  sirketleriYaz(liste);
  return hedef;
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const sor = async (soru, varsayilan = '') => (await rl.question(`${soru}${varsayilan ? ` [${varsayilan}]` : ''}: `)).trim() || varsayilan;

  console.log('\n=== Şirket kaydı ===');
  let [kod, ad, adres] = process.argv.slice(2);
  kod ||= await sor('Kısa kod (örn. anadolu, axa, sompo — boşluksuz)');
  kod = kod.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!kod) throw new Error('Kod gerekli');
  ad ||= await sor('Şirket adı', kod);
  adres ||= await sor('Portal adresi (giriş sayfası olabilir)');
  if (!/^https?:\/\//.test(adres)) throw new Error('Adres http:// ya da https:// ile başlamalı');

  console.log('\nKayıtta ekrana YAZACAĞINIZ örnek değerleri girin (kullanmayacaklarınızı boş geçin).');
  console.log('Bunlar kayıttan sonra her sorguda yeni müşterinin bilgileriyle değiştirilecek.\n');
  const girdi = {};
  for (const [alan, etiket] of ALANLAR) girdi[alan] = await sor(etiket);
  const h = veriHazirla(girdi);
  // Kullanıcı ekrana nasıl yazdıysa o hali de eşleşsin (34 ABC 123 gibi)
  const ornekler = Object.fromEntries(ALANLAR.map(([a]) => [a, girdi[a]]));
  for (const k of ['plaka', 'plakaIl', 'plakaHarf', 'plakaNo', 'dogumTarihiISO']) if (h[k] && !Object.values(ornekler).includes(h[k])) ornekler[k] = h[k];

  const ayar = { ...ayarlariOku(), gizli: false };
  const context = await tarayiciAc(ayar);
  const page = context.pages()[0] || await context.newPage();
  await page.goto(adres, { waitUntil: 'domcontentloaded' }).catch(e => console.log('Uyarı:', e.message.split('\n')[0]));

  console.log('\n1) Açılan pencerede GİRİŞ yapın (şifre, SMS kodu...). Bu kısım kaydedilmez.');
  console.log('2) Teklif ekranının BAŞINA gelin (boş form).');
  await rl.question('3) Hazır olunca buraya dönüp ENTER\'a basın. ');

  const aktif = context.pages().filter(p => !p.isClosed()).at(-1) || page;
  const baslangic = aktif.url();
  const ciktiDosyasi = path.join(KOK, 'kayitlar', `${kod}.js`);
  const durdur = await kayitBaslat(context, ciktiDosyasi);

  console.log(`\nKAYIT BAŞLADI (başlangıç: ${baslangic})`);
  console.log('Şimdi teklif adımlarını normal şekilde yapın: örnek değerleri yazın, seçimleri yapın, "hesapla"ya basın.');
  console.log('Yanda açılan Playwright penceresinde adımları canlı görebilirsiniz.');
  await rl.question('Fiyat ekranda görününce buraya dönüp ENTER\'a basın. ');

  const kayit = await durdur();
  await context.close().catch(() => {});
  rl.close();
  if (!/await page\d*\./.test(kayit)) throw new Error('Kayıt boş görünüyor; hiç adım yapılmadı mı?');

  const { dosya, atilan, degisen } = donustur({ kod, ad, adres: baslangic, kayit, ornekler });
  const hedef = adaptorYaz(kod, ad, dosya);
  console.log(`\nKaydedildi: ${path.relative(KOK, hedef)}`);
  console.log(`Veriye bağlanan alanlar: ${degisen.join(', ') || '(yok! örnek değerler ekrana aynen yazılmamış olabilir)'}`);
  const eksik = ALANLAR.map(([a]) => a).filter(a => girdi[a] && !degisen.includes(a) && !(a === 'plaka' && degisen.some(d => d.startsWith('plaka'))));
  if (eksik.length) console.log(`DİKKAT, kayıtta bulunamayan alanlar: ${eksik.join(', ')} — dosyada sabit değer kalmış olabilir.`);
  if (atilan.length) console.log(`Güvenlik için şifre/kod satırları atıldı (${atilan.length} adet).`);
  console.log('Robotu açıp (baslat.bat) bu şirketi deneyin.\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error('\nHATA:', e.message); process.exit(1); });
}
