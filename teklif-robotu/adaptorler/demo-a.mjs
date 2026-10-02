// Demo Sigorta A — kaydet.mjs çıktısı örneği (tek sayfalık form).
// Gerçek şirketler için bu dosyaları elle yazmanız gerekmez: kaydet.bat ile kaydedin.
//   veri: brans, tc, dogumTarihi, dogumTarihiISO, plaka, plakaIl, plakaHarf,
//         plakaNo, belgeSeri, belgeNo, telefon, eposta
export const adres = `http://127.0.0.1:${process.env.TEKLIF_PORT || 3737}/demo/a/teklif.html`;

// Boş: sayfadaki "Brüt Prim" satırı otomatik bulunur (Vergi satırı atlanır).
export const fiyatSecici = null;

export async function teklifAl(page, veri, arac) {
  await page.getByRole('textbox', { name: 'T.C. Kimlik No' }).fill(veri.tc);
  await page.getByRole('textbox', { name: 'Plaka' }).fill(veri.plaka);
  await page.getByRole('textbox', { name: 'Ruhsat Seri' }).fill(veri.belgeSeri);
  await page.getByRole('textbox', { name: 'Ruhsat No' }).fill(veri.belgeNo);
  await page.getByRole('button', { name: 'Teklif Hesapla' }).click();
  await page.getByText('Brüt Prim').waitFor(); // sabit beklemek yerine sonucu bekle
  return arac.fiyatBul(page, fiyatSecici);
}
