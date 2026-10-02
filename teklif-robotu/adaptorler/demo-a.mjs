// Demo Sigorta A — kaydet.mjs çıktısı örneği (tek sayfalık form).
// Gerçek şirketler için bu dosyaları elle yazmanız gerekmez: kaydet.bat ile kaydedin.
//   veri: brans, tc, dogumTarihi, dogumTarihiISO, plaka, plakaIl, plakaHarf,
//         plakaNo, belgeSeri, belgeNo, telefon, eposta
export const adres = `http://127.0.0.1:${process.env.TEKLIF_PORT || 3737}/demo/a/teklif.html`;

// Boş: sayfadaki "Brüt Prim" satırı otomatik bulunur (Vergi satırı atlanır).
export const fiyatSecici = null;

// EGM sorgusu: bu şirket sirketler.json'da "egm": true işaretliyse, teklif
// turundan önce bir kez çağrılır. Araç bilgisini okuyup döndürür; motor bunu
// veri.arac'a yazıp tüm şirketlere aktarır.
export async function egmSorgu(page, veri, arac) {
  await page.goto(adres.replace('teklif.html', 'egm.html'), { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Plaka').fill(veri.plaka);
  await page.getByLabel('Belge Seri').fill(veri.belgeSeri);
  await page.getByLabel('Belge No').fill(veri.belgeNo);
  await page.getByRole('button', { name: 'EGM Sorgula' }).click();
  await page.locator('#arac').waitFor();
  const oku = s => page.locator(s).innerText();
  return {
    marka: await oku('#marka'), model: await oku('#model'), modelYili: await oku('#yil'),
    kullanimTarzi: await oku('#kt'), koltuk: await oku('#koltuk'),
    motorNo: await oku('#motor'), saseNo: await oku('#sase'),
  };
}

export async function teklifAl(page, veri, arac) {
  await page.getByRole('textbox', { name: 'T.C. Kimlik No' }).fill(veri.tc);
  await page.getByRole('textbox', { name: 'Plaka' }).fill(veri.plaka);
  await page.getByRole('textbox', { name: 'Ruhsat Seri' }).fill(veri.belgeSeri);
  await page.getByRole('textbox', { name: 'Ruhsat No' }).fill(veri.belgeNo);
  await page.getByRole('button', { name: 'Teklif Hesapla' }).click();
  await page.getByText('Brüt Prim').waitFor(); // sabit beklemek yerine sonucu bekle
  return arac.fiyatBul(page, fiyatSecici);
}
