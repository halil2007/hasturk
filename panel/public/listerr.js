// İlan hatası açıklaması: kanalın döndürdüğü ham mesaj (ör. "Stok: ikas: Variant not found") → ne oldu + ne yapmalı.
// Panel (Ürünler, Entegrasyonlar) ve sunucu (hata grupları) aynı kuralları kullanır.
const RULES = [
  [/not ?found|bulunamad|does ?n[o']t exist|no such|silinmi|deleted|kayıt yok/i, 'İlan kanalda bulunamadı',
    'İlan kanalda silinmiş ya da kodu (varyant / barkod) değişmiş. Entegrasyonlar\'da ilanları yenileyin; ilan kanalda artık yoksa Eşleştirme\'den bağlantısını kaldırın.'],
  [/kampanya|campaign|promotion|indirim dönemi/i, 'Ürün kampanyada',
    'Kampanyadaki ürünün fiyatı kampanya bitene kadar değiştirilemez. Kampanya bitince panel fiyatı yeniden gönderir.'],
  [/onay|approv|pending|inceleme|review|moderat/i, 'İlan kanalın onayını bekliyor',
    'Onaylanmamış ilana stok / fiyat gönderilemez. Kanal ilanı onaylayınca otomatik düzelir.'],
  [/kilit|locked|blok|blocked|suspend|pasif|inactive|satışa kapalı|archiv/i, 'İlan kanalda kapalı ya da kilitli',
    'İlan kanalda satışa kapatılmış, arşivlenmiş ya da kilitlenmiş. Kanalın satıcı panelinden ilanı açın.'],
  [/fiyat.*(düşük|yüksek|aralı|sınır|limit)|price.*(range|limit|low|high|less|greater)|min.*price|max.*price|buybox/i, 'Fiyat kanalın izin verdiği aralığın dışında',
    'Kanal bu fiyatı kabul etmiyor (alt / üst sınır, piyasa fiyatı kontrolü). Fiyatı kontrol edin ya da otomatik fiyat kuralının sınırlarını düzeltin.'],
  [/variant|varyant|productId|ürün kimliği|mismatch|eşleşm/i, 'Varyant / ürün bilgisi uyuşmuyor',
    'Kanaldaki ürün ya da varyant yeniden oluşturulmuş olabilir. Entegrasyonlar\'da ilanları yenileyin; düzelmezse Eşleştirme\'den ilanı yeniden bağlayın.'],
  [/HTTP 401|unauthori|token|kimlik/i, 'API bilgileri geçersiz',
    'Kanalın API anahtarı / şifresi değişmiş ya da süresi dolmuş. Entegrasyonlar\'dan bilgileri güncelleyin.'],
  [/HTTP 403|forbidden|yetki|permission|scope/i, 'API yetkisi yok',
    'API kullanıcısının stok / fiyat güncelleme izni kapalı ya da IP kısıtı var. Kanalın satıcı panelinden API yetkilerini açın.'],
  [/HTTP 429|too many|rate|çok fazla istek|limit exceeded/i, 'Kanal geçici olarak istek sınırına takıldı',
    'Kendiliğinden düzelir: panel bir sonraki senkronda yeniden gönderir.'],
  [/HTTP 5\d\d|timeout|zaman aşımı|ECONN|fetch failed|network|yanıt vermedi|bağlan/i, 'Kanal sunucusu geçici hata verdi',
    'Kanal tarafındaki geçici bir sorun. Panel bir sonraki senkronda yeniden dener; düzelmezse "Yeniden dene"ye basın.'],
  [/stok|stock|quantity|adet/i, 'Stok değeri kabul edilmedi',
    'Kanal bu stok adedini kabul etmedi (ör. üst sınır, kapalı ilan). Ürünün stoğunu ve ilanın kanaldaki durumunu kontrol edin.'],
];

export function explainError(msg) {
  const raw = String(msg || '');
  const kind = /^Fiyat/.test(raw) ? 'Fiyat' : /^Stok/.test(raw) ? 'Stok' : '';
  const text = raw.replace(/^(Stok|Fiyat)( kanal tarafından reddedildi)?:\s*/, '').replace(/^ikas:\s*/, '');
  for (const [re, title, fix] of RULES) if (re.test(text)) return { kind, title, fix, text };
  return { kind, title: 'Kanal güncellemeyi kabul etmedi', fix: 'Kanalın verdiği mesaja bakın; düzeltince "Yeniden dene"ye basın. Anlaşılmazsa Destek\'ten bize iletin.', text };
}
// Aynı nedenli hataları tek grupta toplamak için: sayılar, kodlar ve tırnak içindeki değerler atılır
export const errorKey = (msg) => String(msg || '').replace(/["'“”][^"'“”]{0,80}["'“”]/g, '…').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '#').replace(/\d+([.,]\d+)?/g, '#').slice(0, 160);
