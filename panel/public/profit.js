// Kârlılık hesabı — panel (tarayıcı) ve sunucu (sipariş kârı, istatistik) aynı formülü kullanır.
// Tüm tutarlar KDV dahil girilir (pazaryerlerinin gösterdiği gibi).
//   Satıştan kalan (hakediş) = satış − komisyon − kargo − hizmet bedeli
//   Ürün başı kâr            = hakediş − alış − diğer giderler [− ödenecek KDV, "KDV'yi hesaba kat" açıksa]
// Komisyon, kargo, hizmet bedeli ve diğer giderlerin KDV'si %20 kabul edilir (indirilecek KDV).

export const SERVICE_VAT = 20;

export function profit({ sale = 0, purchase = 0, commissionRate = 0, shipping = 0, fee = 0, extra = 0, vatRate = 20, includeVat = false, qty = 1 } = {}) {
  const n = (v) => (Number.isFinite(+v) ? +v : 0);
  sale = n(sale); purchase = n(purchase); commissionRate = n(commissionRate); shipping = n(shipping); fee = n(fee); extra = n(extra); vatRate = n(vatRate);
  qty = Math.max(1, Math.round(n(qty)) || 1);
  const commission = (sale * commissionRate) / 100;
  const payout = sale - commission - shipping - fee;
  const k = vatRate / (100 + vatRate), s = SERVICE_VAT / (100 + SERVICE_VAT);
  const vat = {
    sale: sale * k, purchase: purchase * k,
    services: (commission + shipping + fee + extra) * s,
  };
  vat.payable = vat.sale - vat.purchase - vat.services;
  const unit = payout - purchase - extra - (includeVat ? vat.payable : 0);
  return {
    commission, payout, vat, unitProfit: unit, totalProfit: unit * qty, qty,
    margin: sale ? (unit / sale) * 100 : 0,      // satış fiyatına göre kâr oranı
    markup: purchase ? (unit / purchase) * 100 : 0, // alış fiyatına göre kâr (ROI)
    breakEven: priceFor({ purchase, commissionRate, shipping, fee, extra, vatRate, includeVat }, 0),
  };
}

// Hedef kâr oranı (satış fiyatının %'si) için gereken satış fiyatı. Mümkün değilse null.
export function priceFor({ purchase = 0, commissionRate = 0, shipping = 0, fee = 0, extra = 0, vatRate = 20, includeVat = false }, targetMargin = 0) {
  const r = commissionRate / 100, m = targetMargin / 100;
  const k = includeVat ? vatRate / (100 + vatRate) : 0, s = includeVat ? SERVICE_VAT / (100 + SERVICE_VAT) : 0;
  const denom = 1 - r - k + s * r - m;
  if (denom <= 0) return null;
  const fixed = shipping + fee + purchase + extra - k * purchase - s * (shipping + fee + extra);
  return fixed / denom;
}
