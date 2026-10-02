// Demo Sigorta B — iki adımlı sihirbaz, açılır liste ve tablo halinde sonuç.
//   veri: brans, tc, dogumTarihi, dogumTarihiISO, plaka, plakaIl, plakaHarf,
//         plakaNo, belgeSeri, belgeNo, telefon, eposta
export const adres = `http://127.0.0.1:${process.env.TEKLIF_PORT || 3737}/demo/b/index.html`;

// Fiyat alanı belli olduğunda seçiciyle okumak en sağlamı.
export const fiyatSecici = '#odenecek';

export async function teklifAl(page, veri, arac) {
  await page.getByRole('textbox', { name: 'Kimlik Numarası' }).fill(veri.tc);
  await page.getByRole('textbox', { name: 'Doğum Tarihi' }).fill(veri.dogumTarihi);
  await page.getByRole('button', { name: 'Devam' }).click();
  await page.getByRole('textbox', { name: 'Araç Plakası' }).fill(veri.plaka);
  await page.getByRole('textbox', { name: 'Belge Seri' }).fill(veri.belgeSeri);
  await page.getByRole('textbox', { name: 'Belge Numarası' }).fill(veri.belgeNo);
  // Branşa göre farklı seçim gerekiyorsa veri.brans ile dallanabilirsiniz
  await page.getByLabel('Kullanım Tarzı').selectOption('hususi');
  await page.getByRole('button', { name: 'Fiyat Al' }).click();
  await page.locator(fiyatSecici).waitFor();
  return arac.fiyatBul(page, fiyatSecici);
}
