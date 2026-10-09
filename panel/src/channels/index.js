// Satış kanalları. API bilgileri panelden (Entegrasyonlar) ya da Cloudflare gizli değişkenlerinden gelir; panel önceliklidir.
import { ikas } from './ikas.js';
import { trendyol } from './trendyol.js';
import { hepsiburada } from './hepsiburada.js';
import { pttavm } from './pttavm.js';
import { n11 } from './n11.js';
import { idefix } from './idefix.js';
import { pazarama } from './pazarama.js';
import { amazon } from './amazon.js';
import { ciceksepeti } from './ciceksepeti.js';
import { koctas } from './koctas.js';
import { shopify } from './shopify.js';
import { woocommerce } from './woocommerce.js';
import { opencart } from './opencart.js';
import { etsy } from './etsy.js';
import { demo } from './demo.js';
import { loadConfig, effectiveEnv, configVersion, EXTRA_RE, TYPES, TYPE_NAMES, BETA_TYPES, isBeta, typeOf, storeEnv, releasedTypes } from '../config.js';
import { getRaw, setSetting } from '../db.js';

// Test aşamasındaki kanallar (BETA_TYPES) da ana mağaza olarak listelenir (ana ve müşteri panellerinde; beta: "Test aşamasında" etiketi)
export const BASE_IDS = ['ikas1', 'ikas2', 'trendyol', 'hepsiburada', 'pttavm', 'n11', 'idefix', 'pazarama', 'woocommerce', ...BETA_TYPES];
// Geçerli kanal kimlikleri: ana mağazalar + eklenen mağazalar (getChannels her çağrıda günceller)
export const CHANNEL_IDS = [...BASE_IDS];
export const isChannelId = (id) => CHANNEL_IDS.includes(id) || EXTRA_RE.test(String(id || ''));
const FACTORY = { trendyol, hepsiburada, pttavm, n11, idefix, pazarama, amazon, ciceksepeti, koctas, shopify, woocommerce, opencart, etsy };
const make = (type, e, meta) => (type === 'ikas' ? ikas(e, 'IKAS1_', meta) : FACTORY[type](e, meta));
// Bekleyen kanallar: bilgileri girilip "Bağlantıyı test et" başarılı olana kadar yalnızca Entegrasyonlar'da görünür;
// sipariş, ürün, stok ve analiz ekranlarına ve senkrona girmez. Bilgiler değişirse yeniden onay gerekir.
export const GATED = ['pttavm', 'n11', 'idefix', 'pazarama', 'woocommerce', ...BETA_TYPES];

// Beklemedeki kanal (Entegrasyonlar → "Kanala yazmayı beklet"): siparişler, ürünler, stok ve etiketler okunmaya devam eder;
// kanala yazan işlemler (paketleme / kargoya hazırlama, kargoya verme, paket iptali, stok ve fiyat gönderimi, ürün oluşturma) yapılmaz.
export const WRITE_OPS = ['accept', 'split', 'pack', 'ship', 'repack', 'cancelPackage', 'changeCargo', 'pushStock', 'pushPrice', 'createProduct', 'answer', 'catalog', 'approveClaim', 'rejectClaim', 'campaigns'];
export const DEFAULT_HOLD = [];
function held(c) {
  const o = { ...c, hold: true, caps: { ...(c.caps || {}), hold: true, accept: 'local', split: 'local', pack: null, ship: 'local', cargo: false, repack: false, cancelPackage: false, createProduct: false, price: false } };
  for (const k of WRITE_OPS) delete o[k];
  return o;
}

// Yapılandırma değişmedikçe kanal nesneleri (ve aldıkları erişim belirteçleri) yeniden kullanılır
let cache = null;
export async function getChannels(env, db) {
  const ver = db ? await configVersion(db) : 0;
  if (cache && cache.env === env && cache.ver === ver) return cache.list;
  const cfg = db ? await loadConfig(env, db) : {}, rel = await releasedTypes(env, db), beta = (id) => isBeta(id, rel);
  const e = effectiveEnv(env, cfg);
  const meta = {
    ikas1: { id: 'ikas1', type: 'ikas', name: e.IKAS1_NAME || (env.TENANT_SLUG ? 'Mağaza 1' : 'HasTürk'), short: e.IKAS1_SHORT || e.IKAS1_NAME || (env.TENANT_SLUG ? 'Mağaza 1' : 'HasTürk') },
    ikas2: { id: 'ikas2', type: 'ikas', name: e.IKAS2_NAME || (env.TENANT_SLUG ? 'Mağaza 2' : 'Tarım Dünyası'), short: e.IKAS2_SHORT || e.IKAS2_NAME || (env.TENANT_SLUG ? 'Mağaza 2' : 'Tarım Dünyası') },
    trendyol: { id: 'trendyol', type: 'trendyol', name: 'Trendyol', short: 'Trendyol' },
    hepsiburada: { id: 'hepsiburada', type: 'hepsiburada', name: 'Hepsiburada', short: 'Hepsiburada' },
    pttavm: { id: 'pttavm', type: 'pttavm', name: 'PttAVM', short: 'PttAVM' },
    n11: { id: 'n11', type: 'n11', name: 'N11', short: 'N11' },
    idefix: { id: 'idefix', type: 'idefix', name: 'idefix', short: 'idefix' },
    pazarama: { id: 'pazarama', type: 'pazarama', name: 'Pazarama', short: 'Pazarama' },
  };
  // Kanalın kendi sakladığı değerler (ör. yenilenen erişim belirteci): settings → "kv:<kanal>:<anahtar>"
  const kvFor = (id) => (db ? { get: (k) => getRaw(db, `kv:${id}:${k}`), set: (k, v) => setSetting(db, `kv:${id}:${k}`, v) } : null);
  meta.woocommerce = { id: 'woocommerce', type: 'woocommerce', name: 'WooCommerce', short: 'WooCommerce', kv: kvFor('woocommerce') };
  for (const t of BETA_TYPES) meta[t] = { id: t, type: t, name: TYPE_NAMES[t], short: TYPE_NAMES[t], ...(beta(t) ? { beta: true } : { released: rel.includes(t) }), kv: kvFor(t) };
  const real = {
    ikas1: ikas(e, 'IKAS1_', meta.ikas1),
    ikas2: ikas(e, 'IKAS2_', meta.ikas2),
    trendyol: trendyol(e, meta.trendyol),
    hepsiburada: hepsiburada(e, meta.hepsiburada),
    pttavm: pttavm(e, meta.pttavm),
    n11: n11(e, meta.n11),
    idefix: idefix(e, meta.idefix),
    pazarama: pazarama(e, meta.pazarama),
    woocommerce: woocommerce(e, meta.woocommerce),
  };
  for (const t of BETA_TYPES) real[t] = FACTORY[t](e, meta[t]);
  // Eklenen mağazalar: türe göre sıralı (ikas_3, trendyol_2, ...)
  const extras = Object.keys(cfg).filter((id) => EXTRA_RE.test(id)).sort((a, b) => {
    const [, ta, na] = EXTRA_RE.exec(a), [, tb, nb] = EXTRA_RE.exec(b);
    return TYPES.indexOf(ta) - TYPES.indexOf(tb) || Number(na) - Number(nb);
  });
  for (const id of extras) {
    const type = typeOf(id), v = cfg[id].values || {}, n = EXTRA_RE.exec(id)[2];
    const name = v.STORE_LABEL || (type === 'ikas' ? v.IKAS1_NAME : '') || `${TYPE_NAMES[type]} ${n}`;
    meta[id] = { id, type, name, short: name, extra: true, ...((BETA_TYPES.includes(type) || type === 'woocommerce') ? { kv: kvFor(id), ...(beta(id) ? { beta: true } : {}) } : {}) };
    real[id] = make(type, storeEnv(env, type, v), meta[id]);
  }
  const ids = [...BASE_IDS, ...extras];
  CHANNEL_IDS.splice(0, CHANNEL_IDS.length, ...ids);
  const verified = {};
  if (db) for (const id of ids) if (GATED.includes(typeOf(id))) verified[id] = await getRaw(db, 'verified:' + id);
  const holdIds = db ? (await getRaw(db, 'hold_channels')) ?? DEFAULT_HOLD : [];
  const hold = new Set(Array.isArray(holdIds) ? holdIds : []);
  const list = ids.map((id) => {
    // Panelde "pasif" yapılan kanal hiç çalışmaz
    if (cfg[id] && cfg[id].active === false) return { ...real[id], enabled: false, paused: true };
    // Bağlantısı onaylanmamış kanal: son kayıttan sonra başarılı test yoksa listelere girmez; test için gerçek bağlantı ayrıca tutulur
    if (GATED.includes(typeOf(id))) {
      const v = verified[id], ok = v && cfg[id] && v.at >= (cfg[id].updated || 0);
      if (!ok) return { ...real[id], enabled: false, paused: true, gated: true, real: real[id] };
      return hold.has(id) ? held(real[id]) : real[id];
    }
    if (meta[id].extra) return hold.has(id) ? held(real[id]) : real[id];
    // DEMO=1: anahtarı olmayan kanallar örnek veriyle çalışır (anahtarı girilmiş kanal gerçek kalır)
    const c = env.DEMO === '1' && !real[id].enabled ? demo(meta[id]) : real[id];
    return hold.has(id) && !c.demo ? held(c) : c;
  });
  cache = { env, ver, list };
  return list;
}
export const resetChannels = () => { cache = null; };
export const channel = async (env, db, id) => (await getChannels(env, db)).find((c) => c.id === id);
export const publicInfo = (c) => ({ id: c.id, type: c.type, beta: !!c.beta, released: !!c.released, sandbox: !!c.sandbox, extra: !!c.extra, claims: !!c.claims, campaigns: !!c.campaigns, name: c.name, short: c.short, enabled: c.enabled, paused: !!c.paused, gated: !!c.gated, demo: !!c.demo, hold: !!c.hold, missing: c.missing, caps: c.caps,
  // Kanalın gerçekten yapabildikleri (arayüzde yalnız bunlar listelenir)
  can: ((r) => ({ orders: !!r.fetchOrders, listings: !!r.fetchListings, stock: !!r.pushStock, price: !!r.pushPrice, questions: !!r.questions }))(c.real || c) });
