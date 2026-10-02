// Motor, sunucu ve kayıt aracının ortak parçaları.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const KOK = path.dirname(fileURLToPath(import.meta.url));
export const PROFIL = process.env.TEKLIF_PROFIL || path.join(KOK, 'profil');
export const ADAPTORLER = path.join(KOK, 'adaptorler');

export function ayarlariOku() {
  const ayar = JSON.parse(fs.readFileSync(path.join(KOK, 'ayarlar.json'), 'utf8'));
  if (process.env.TEKLIF_TARAYICI_YOLU) ayar.tarayiciYolu = process.env.TEKLIF_TARAYICI_YOLU;
  if (process.env.TEKLIF_GIZLI) ayar.gizli = process.env.TEKLIF_GIZLI === '1';
  if (process.env.TEKLIF_PORT) ayar.port = Number(process.env.TEKLIF_PORT);
  return ayar;
}

export function sirketleriOku() {
  return JSON.parse(fs.readFileSync(path.join(KOK, 'sirketler.json'), 'utf8'));
}

export function sirketleriYaz(liste) {
  fs.writeFileSync(path.join(KOK, 'sirketler.json'), JSON.stringify(liste, null, 2) + '\n');
}

// Tek tarayıcı profili: her şirket kendi sekmesinde. Çerezler alan adına göre
// ayrıldığı için şirketler birbirinin oturumunu bozmaz; profil kalıcı olduğu
// için "beni hatırla" türü girişler kapatıp açınca da durur.
export async function tarayiciAc(ayar) {
  const ortak = { headless: !!ayar.gizli, viewport: null, args: ['--start-maximized'] };
  const denemeler = [];
  if (ayar.tarayiciYolu) denemeler.push({ executablePath: ayar.tarayiciYolu });
  if (ayar.kanal) denemeler.push({ channel: ayar.kanal });
  if (ayar.kanal !== 'msedge') denemeler.push({ channel: 'msedge' }); // Windows'ta her zaman var
  denemeler.push({}); // Playwright'ın kendi Chromium'u (npx playwright install chromium)
  let sonHata;
  for (const d of denemeler) {
    try {
      return await chromium.launchPersistentContext(PROFIL, { ...ortak, ...d });
    } catch (e) {
      sonHata = e;
      if (/ProcessSingleton|already in use|user data directory is already/i.test(e.message)) {
        throw new Error('Tarayıcı profili başka bir pencerede açık (robot ya da kayıt aracı zaten çalışıyor olabilir). Onu kapatıp tekrar deneyin.');
      }
    }
  }
  throw new Error('Tarayıcı açılamadı: ' + sonHata.message.split('\n')[0]);
}

// ---- Girilen bilgileri tek biçime getir --------------------------------

export function tcGecerliMi(tc) {
  if (!/^[1-9]\d{10}$/.test(tc)) return false;
  const d = [...tc].map(Number);
  const tek = d[0] + d[2] + d[4] + d[6] + d[8];
  const cift = d[1] + d[3] + d[5] + d[7];
  if (((tek * 7 - cift) % 10 + 10) % 10 !== d[9]) return false;
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}

export function veriHazirla(girdi) {
  const temiz = s => String(s ?? '').trim();
  const veri = {};
  for (const [k, v] of Object.entries(girdi || {})) veri[k] = temiz(v);
  veri.brans = (veri.brans || 'trafik').toLowerCase();
  veri.tc = (veri.tc || '').replace(/\D/g, '');
  veri.plaka = (veri.plaka || '').toLocaleUpperCase('tr').replace(/[\s-]/g, '');
  veri.belgeSeri = (veri.belgeSeri || '').toLocaleUpperCase('tr').replace(/\s/g, '');
  veri.belgeNo = (veri.belgeNo || '').replace(/\s/g, '');
  // Plakayı parçalı isteyen ekranlar için: 34 / ABC / 123
  const p = veri.plaka.match(/^(\d{2})([A-ZÇĞİÖŞÜ]{1,3})(\d{2,4})$/);
  veri.plakaIl = p ? p[1] : '';
  veri.plakaHarf = p ? p[2] : '';
  veri.plakaNo = p ? p[3] : '';
  // Doğum tarihi: GG.AA.YYYY, ayrıca ISO (YYYY-AA-GG) hali
  const dt = veri.dogumTarihi || '';
  let g, a, y, m;
  if ((m = dt.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/))) [, g, a, y] = m;
  else if ((m = dt.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [, y, a, g] = m;
  if (y) {
    veri.dogumTarihi = `${g.padStart(2, '0')}.${a.padStart(2, '0')}.${y}`;
    veri.dogumTarihiISO = `${y}-${a.padStart(2, '0')}-${g.padStart(2, '0')}`;
  }
  // EGM sorgusundan gelen araç bilgisi buraya yazılır; tüm şirketler okur.
  veri.arac = {};
  return veri;
}

// EGM sorgusunun döndürdüğü araç alanlarını tek biçime getirir.
export function aracDuzelt(ham) {
  const temiz = s => String(s ?? '').trim();
  const arac = {};
  for (const [k, v] of Object.entries(ham || {})) arac[k] = temiz(v);
  if (arac.modelYili) arac.modelYili = (arac.modelYili.match(/\d{4}/) || [''])[0];
  if (arac.koltuk) arac.koltuk = (arac.koltuk.match(/\d+/) || [''])[0];
  for (const k of ['saseNo', 'motorNo']) if (arac[k]) arac[k] = arac[k].toLocaleUpperCase('tr').replace(/\s/g, '');
  return arac;
}

// Araç bilgisini kısa, okunur bir satıra çevirir (arayüz başlığı için).
export function aracOzet(arac) {
  if (!arac) return '';
  const p = [arac.marka, arac.model, arac.modelYili].filter(Boolean).join(' ');
  const k = arac.koltuk ? `${arac.koltuk} koltuk` : '';
  return [p, arac.kullanimTarzi, k].filter(Boolean).join(' · ');
}

export function veriKontrol(veri) {
  const uyarilar = [];
  if (veri.tc && veri.tc.length === 11 && !tcGecerliMi(veri.tc)) uyarilar.push('T.C. kimlik numarası geçersiz görünüyor');
  if (veri.tc && veri.tc.length !== 11 && veri.tc.length !== 10) uyarilar.push('T.C. 11, vergi no 10 haneli olmalı');
  if (veri.plaka && !veri.plakaIl) uyarilar.push('Plaka biçimi tanınmadı (örn. 34ABC123)');
  return uyarilar;
}

// ---- Sayfadan fiyat okuma ----------------------------------------------

// "1.234,56" → 1234.56 ; "1234.56" → 1234.56
export function tutarCevir(metin) {
  let s = String(metin).replace(/[^\d.,]/g, '');
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{1,2}$/.test(s) && (s.match(/\./g) || []).length === 1) s = s.replace(/,/g, '');
  else s = s.replace(/[.,]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const TUTAR = /(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:TL|TRY|₺)|(?:TL|₺)\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?)/i;
const IYI = /(br[üu]t\s*prim|toplam\s*prim|[öo]denecek|genel\s*toplam|toplam\s*tutar|pol[iı]çe\s*primi)/i;
const KOTU = /(vergi|bsmv|gv|thgf|komisyon|net\s*prim|indirim|taksit)/i;

// Sayfada görünen metinden en olası "ödenecek prim" tutarını bulur.
// secici verilirse doğrudan o alanın metnini okur.
export async function fiyatBul(page, secici) {
  if (secici) {
    const metin = (await page.locator(secici).first().innerText()).trim();
    return { fiyat: tutarCevir(metin), fiyatMetni: metin };
  }
  const satirlar = (await page.locator('body').innerText()).split('\n').map(s => s.trim()).filter(Boolean);
  let enIyi = null;
  satirlar.forEach((satir, i) => {
    const m = satir.match(TUTAR);
    if (!m) return;
    const fiyat = tutarCevir(m[1] || m[2]);
    if (!fiyat || fiyat < 50) return;
    const komsu = (satirlar[i - 1] || '') + ' ' + satir;
    let puan = 1;
    if (IYI.test(komsu)) puan += 10;
    if (KOTU.test(satir)) puan -= 5;
    if (!enIyi || puan > enIyi.puan || (puan === enIyi.puan && fiyat > enIyi.fiyat)) enIyi = { puan, fiyat, fiyatMetni: satir };
  });
  return enIyi ? { fiyat: enIyi.fiyat, fiyatMetni: enIyi.fiyatMetni } : { fiyat: null, fiyatMetni: '' };
}

// Ekranda görünür bir şifre kutusu varsa oturum kapalı sayılır.
export async function girisSayfasiMi(page) {
  try {
    return (await page.locator('input[type="password"]:visible').count()) > 0;
  } catch {
    return true; // sayfa yükleniyor; emin olana kadar giriş bekleniyor say
  }
}
