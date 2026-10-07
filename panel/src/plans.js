// Paketler: tanıtım sitesindeki paketlerle aynı (site/public/assets/config.js). Ana panelde firma kartında paket seçilir; mağaza /
// kullanıcı sınırı ve pakete özel özellikler müşteri panelinde uygulanır. Paket seçilmemiş ya da "Özel" paketli firmada sınır yoktur
// (sınırlar firma kartındaki alanlardan girilir). Ana panel (kendi mağazanız) ve demo paneli hiçbir sınıra takılmaz.
import { fail } from './util.js';

export const PLANS = {
  baslangic: { name: 'Başlangıç', stores: 3, users: 2, features: [] },
  profesyonel: { name: 'Profesyonel', stores: 10, users: 5, features: ['buybox', 'autoupload', 'finance', 'bulk', 'roles'] },
  kurumsal: { name: 'Kurumsal', stores: 25, users: 0, features: ['buybox', 'autoupload', 'finance', 'bulk', 'roles', 'stockapi'] },
};
export const FEATURES = {
  buybox: 'Buybox takibi ve otomatik fiyat', autoupload: 'Otomatik ürün gönderimi', finance: 'Hakediş ve kesilen faturalar',
  bulk: 'Excel ile toplu güncelleme', roles: 'Personel yetkileri ve rol şablonları', stockapi: 'Stok API',
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
