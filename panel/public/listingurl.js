// İlanın kanaldaki satış sayfası: kanal adres verdiyse o (Trendyol productUrl), yoksa kanalın ürün kodundan (Hepsiburada HB…,
// Amazon ASIN) kurulur; kurulamazsa kanalda ürün adı / barkodla arama açılır. Panel ve sunucu aynı kuralı kullanabilir (DOM yok).
const enc = encodeURIComponent;
const site = (domain, q) => `https://www.google.com/search?q=${enc(`site:${domain} ${q}`)}`;
export function listingUrl(type, l = {}) {
  if (/^https:\/\//.test(l.url || '')) return l.url;
  const q = String(l.name || l.barcode || l.sku || '').trim(), pid = String(l.remote_product_id || ''), rid = String(l.remote_id || '');
  if (!q && !pid && !rid) return '';
  switch (type) {
    case 'trendyol': return `https://www.trendyol.com/sr?q=${enc(q)}`;
    case 'hepsiburada': return /^HB[A-Z0-9]+$/i.test(rid) ? `https://www.hepsiburada.com/-p-${enc(rid)}` : `https://www.hepsiburada.com/ara?q=${enc(q)}`;
    case 'n11': return `https://www.n11.com/arama?q=${enc(q)}`;
    case 'amazon': return /^B0[A-Z0-9]{8}$/i.test(pid) ? `https://www.amazon.com.tr/dp/${enc(pid)}` : `https://www.amazon.com.tr/s?k=${enc(q)}`;
    case 'idefix': return site('idefix.com', q);
    case 'pttavm': return site('pttavm.com', q);
    case 'pazarama': return site('pazarama.com', q);
    case 'ciceksepeti': return site('ciceksepeti.com', q);
    case 'koctas': return site('koctas.com.tr', q);
    case 'teknosa': return site('teknosa.com', q);
    case 'ebay': return `https://www.ebay.com/sch/i.html?_nkw=${enc(q)}`;
    case 'etsy': return `https://www.etsy.com/search?q=${enc(q)}`;
    case 'ozon': return `https://www.ozon.ru/search/?text=${enc(q)}`;
    default: return '';
  }
}
