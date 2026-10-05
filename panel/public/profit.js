// Kârlılık hesabı — panel (tarayıcı) ve sunucu (sipariş kârı, istatistik) aynı formülü kullanır.
// Tüm tutarlar KDV dahil girilir (pazaryerlerinin gösterdiği gibi).
//   Satıştan kalan (hakediş) = satış − komisyon − kargo − hizmet bedeli − ek kesinti (işlem / ödeme bedeli, %) − stopaj
//   Ürün başı kâr            = hakediş − alış − diğer giderler [− ödenecek KDV, "KDV'yi hesaba kat" açıksa]
// Komisyon, kargo, hizmet bedeli, ek kesinti ve diğer giderlerin KDV'si %20 kabul edilir (indirilecek KDV).
// Stopaj (e-ticaret stopajı): pazaryerinin hakedişten kestiği gelir vergisi; KDV hariç satış tutarı üzerinden (varsayılan %1).
// Yıllık gelir vergisinden mahsup edilir; nakit akışında kesildiği için hakedişten düşülür.

export const SERVICE_VAT = 20;
// Ayarlardaki kanal bazlı gider (komisyon %, kargo ₺, hizmet bedeli ₺, ek kesinti %, stopaj %).
// Eklenen mağaza (trendyol_2, ikas_3) için değer girilmemişse aynı türün ana mağazasındaki değer kullanılır.
const baseId = (ch) => String(ch || '').replace(/_\d+$/, '').replace(/^ikas$/, 'ikas1');
export const costOf = (settings, key, ch) => { const m = (settings && settings[key]) || {}; return Number(m[ch] ?? m[baseId(ch)] ?? 0) || 0; };
export const COST_KEYS = ['commission', 'shipping', 'service_fee', 'fee_rate', 'withholding'];

export function profit({ sale = 0, purchase = 0, commissionRate = 0, shipping = 0, fee = 0, extra = 0, vatRate = 20, includeVat = false, qty = 1, feeRate = 0, withholdingRate = 0 } = {}) {
  const n = (v) => (Number.isFinite(+v) ? +v : 0);
  sale = n(sale); purchase = n(purchase); commissionRate = n(commissionRate); shipping = n(shipping); fee = n(fee); extra = n(extra); vatRate = n(vatRate); feeRate = n(feeRate); withholdingRate = n(withholdingRate);
  qty = Math.max(1, Math.round(n(qty)) || 1);
  const commission = (sale * commissionRate) / 100;
  const rateFee = (sale * feeRate) / 100;
  const withholding = ((sale * 100) / (100 + vatRate) * withholdingRate) / 100;
  const payout = sale - commission - shipping - fee - rateFee - withholding;
  const k = vatRate / (100 + vatRate), s = SERVICE_VAT / (100 + SERVICE_VAT);
  const vat = {
    sale: sale * k, purchase: purchase * k,
    services: (commission + shipping + fee + rateFee + extra) * s,
  };
  vat.payable = vat.sale - vat.purchase - vat.services;
  const unit = payout - purchase - extra - (includeVat ? vat.payable : 0);
  return {
    commission, rateFee, withholding, payout, vat, unitProfit: unit, totalProfit: unit * qty, qty,
    margin: sale ? (unit / sale) * 100 : 0,      // satış fiyatına göre kâr oranı
    markup: purchase ? (unit / purchase) * 100 : 0, // alış fiyatına göre kâr (ROI)
    breakEven: priceFor({ purchase, commissionRate, shipping, fee, extra, vatRate, includeVat, feeRate, withholdingRate }, 0),
  };
}

// Hedef kâr oranı (satış fiyatının %'si) için gereken satış fiyatı. Mümkün değilse null.
export function priceFor({ purchase = 0, commissionRate = 0, shipping = 0, fee = 0, extra = 0, vatRate = 20, includeVat = false, feeRate = 0, withholdingRate = 0 }, targetMargin = 0) {
  const r = (commissionRate + feeRate) / 100, w = (withholdingRate / 100) * (100 / (100 + vatRate)), m = targetMargin / 100;
  const k = includeVat ? vatRate / (100 + vatRate) : 0, s = includeVat ? SERVICE_VAT / (100 + SERVICE_VAT) : 0;
  const denom = 1 - r - w - k + s * r - m;
  if (denom <= 0) return null;
  const fixed = shipping + fee + purchase + extra - k * purchase - s * (shipping + fee + extra);
  return fixed / denom;
}
