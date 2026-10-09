// Kategori yolu: "Bahçe > Tohum", "Bahçe»Tohum", "Bahçe | Tohum" → "Bahçe › Tohum" (panelin tek biçimi). "/" kategori adında
// geçebildiği için ("Ev/Bahçe") ayırıcı sayılmaz. Panel (ürün formu, kategori ağacı) ve sunucu (kayıt, kanaldan gelen) aynı kuralı kullanır.
export const CAT_SEP = ' › ';
export const normCat = (s) => String(s == null ? '' : s).split(/\s*(?:›|»|>|\|)\s*/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean).join(CAT_SEP).slice(0, 300);
// Büyük / küçük harf ve Türkçe karakter farkı gözetmeyen karşılaştırma anahtarı
export const catKey = (s) => normCat(s).toLocaleLowerCase('tr');
