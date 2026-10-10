// Paketler: tanıtım sitesindeki paketlerle aynı (site/public/assets/config.js). Ana panelde firma kartında paket seçilir; mağaza /
// kullanıcı sınırı ve pakete özel özellikler müşteri panelinde uygulanır. Paket seçilmemiş ya da "Özel" paketli firmada sınır yoktur
// (sınırlar firma kartındaki alanlardan girilir). Ana panel (kendi mağazanız) ve demo paneli hiçbir sınıra takılmaz.
import { fail } from './util.js';

// Fiyatlar (TL, KDV dahil): online satışta tutar buradan alınır (tarayıcıdan gelen tutara güvenilmez). Sitedeki fiyatlarla
// (site/public/assets/config.js) aynı tutun. Yıllık = 10 aylık ücret (2 ay hediye).
export const PLANS = {
  baslangic: { name: 'Başlangıç', stores: 3, users: 2, monthly: 990, yearly: 9900, features: [] },
  profesyonel: { name: 'Profesyonel', stores: 10, users: 5, monthly: 1990, yearly: 19900, features: ['buybox', 'autoupload', 'finance', 'bulk', 'roles'] },
  kurumsal: { name: 'Kurumsal', stores: 25, users: 0, monthly: 3990, yearly: 39900, features: ['buybox', 'autoupload', 'finance', 'bulk', 'roles', 'stockapi', 'fx', 'carrier'],
    soon: ['e-Fatura / e-Arşiv entegrasyonu'] },
};
// Ek mağaza: paketteki mağaza sınırının üstüne, mağaza başına YILLIK ücret (TL, KDV dahil). Lisansın bitişine kalan gün kadar
// tek seferde alınır (gün hesabı: yıllık ücret × kalan gün / 365, en az 1 gün); paket yenilemesinde yenilenen süre kadar (ay / 12)
// paket ücretine eklenir. Fiyatı buradan değiştirin.
export const EXTRA_STORE = { yearly: 3000, max: 50 };
export const daysLeft = (expiresAt, now = Date.now()) => Math.max(1, Math.ceil(((Number(expiresAt) || now) - now) / 864e5));
export const extraStoreAmount = (qty, days) => Math.round((EXTRA_STORE.yearly * qty * days / 365) * 100) / 100;
export const extraRenewAmount = (qty, months) => Math.round((EXTRA_STORE.yearly * qty * months / 12) * 100) / 100;
// soon: pakete eklenecek, henüz aktif olmayan özellikler (Paketim'de "Yakında" olarak görünür; hiçbir özelliği açmaz)
// Kartla taksit: ödeme sayfasında taksit kısıtlanmaz; bankanın / iyzico hesabının sunduğu tüm seçenekler görünür (peşin fiyatına
// taksit sayısı ve vade farkı iyzico'da ayarlanır). Burada yalnız sitede / panelde gösterilen bilgi tutulur.
export const INSTALLMENTS = { free: 3, max: 12, cards: ['Axess', 'Bonus', 'Maximum', 'World', 'Paraf', 'QNB'] };
// Üst pakete geçiş (dönem ortasında): mevcut dönem fiyatıyla yeni paketin farkı × lisans bitişine kalan gün / dönem günü.
// Bitiş tarihi değişmez, paket hemen yükselir. Alt pakete geçiş yenilemede yapılır (iade yok).
const PERIOD_DAYS = { yearly: 365, monthly: 30 };
export function upgradeQuote(from, to, period, expiresAt, now = Date.now()) {
  const a = PLANS[from], b = PLANS[to];
  if (!a || !b || !PERIOD_DAYS[period] || !(b[period] > a[period])) return null;
  const days = daysLeft(expiresAt, now), diff = b[period] - a[period];
  return { from, to, period, days, diff, amount: Math.max(1, Math.round((diff * days / PERIOD_DAYS[period]) * 100) / 100) };
}
// Havale / EFT ile ödemede indirim (%): yalnız yıllık alımda (aylıkta havale / EFT tam fiyatla)
export const EFT_DISCOUNT = 5;
export const eftAmount = (p) => (p.period === 'yearly' ? Math.round((p.amount * (100 - EFT_DISCOUNT)) / 100) : p.amount);
// Satın alınabilir paket ve dönem → tutar, süre (ay)
export function priceOf(plan, period) {
  const p = PLANS[plan];
  if (!p || !['monthly', 'yearly'].includes(period)) return null;
  return { plan, period, name: p.name, amount: p[period], months: period === 'yearly' ? 12 : 1 };
}
export const FEATURES = {
  buybox: 'Buybox takibi ve otomatik fiyat', autoupload: 'Otomatik ürün gönderimi', finance: 'Hakediş ve kesilen faturalar',
  bulk: 'Excel ile toplu güncelleme', roles: 'Personel yetkileri ve rol şablonları', stockapi: 'Stok API', fx: 'Döviz kuruna endeksli otomatik fiyat',
  carrier: 'Kendi anlaşmalı kargo entegrasyonu (etiket ve takip)',
};
const norm = (s) => String(s || '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/[^a-z]/g, '');
// Firma kartındaki paket adı → paket anahtarı ("Başlangıç", "baslangic", "Profesyonel paket" …); tanınmazsa '' (özel)
export function planKey(s) { const n = norm(s); return Object.keys(PLANS).find((k) => n.startsWith(k) || n.startsWith(norm(PLANS[k].name))) || ''; }
// Firma kaydına göre geçerli sınırlar (firma kartında elle girilen sınır paketinkinden önce gelir)
export function limitsOf(t) {
  const p = PLANS[planKey(t && t.plan)] || null;
  return { plan: p ? planKey(t.plan) : '', stores: Number(t && t.max_stores) || (p ? p.stores : 0), users: Number(t && t.max_users) || (p ? p.users : 0) };
}
// Müşteri panelinin ortamından: paket (yoksa null = sınırsız)
export function tenantPlan(env) {
  if (!env || !env.TENANT_SLUG || env.DEMO === '1') return null;
  const k = env.TENANT_PLAN;
  return PLANS[k] ? { key: k, ...PLANS[k], stores: Number(env.TENANT_MAX_STORES) || PLANS[k].stores } : null;
}
export const allows = (env, f) => { const p = tenantPlan(env); return !p || p.features.includes(f); };
const lowestFor = (f) => Object.values(PLANS).find((p) => p.features.includes(f));
export function requireFeature(env, f) {
  if (allows(env, f)) return;
  const p = tenantPlan(env), up = lowestFor(f);
  fail(403, `${FEATURES[f]} ${up ? up.name : 'üst'} paketinde var; ${p.name} paketinizde kullanılamıyor. Paketinizi yükseltmek için bizimle iletişime geçin.`);
}
// Müşteri paneline giden özet (arayüz: kilitli özellikler, kalan gün)
export function planInfo(env) {
  const p = tenantPlan(env), exp = Number(env && env.TENANT_EXPIRES) || null;
  return {
    plan: p ? p.key : '', planName: p ? p.name : '', stores: p ? p.stores : Number(env && env.TENANT_MAX_STORES) || 0,
    locked: p ? Object.keys(FEATURES).filter((f) => !p.features.includes(f)) : [],
    expires_at: exp, trial: env && env.TENANT_TRIAL === '1', days_left: exp ? Math.ceil((exp - Date.now()) / 864e5) : null,
  };
}
