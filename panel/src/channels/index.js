// Satış kanalları. API bilgileri panelden (Entegrasyonlar) ya da Cloudflare gizli değişkenlerinden gelir; panel önceliklidir.
import { ikas } from './ikas.js';
import { trendyol } from './trendyol.js';
import { hepsiburada } from './hepsiburada.js';
import { pttavm } from './pttavm.js';
import { n11 } from './n11.js';
import { idefix } from './idefix.js';
import { pazarama } from './pazarama.js';
import { demo } from './demo.js';
import { loadConfig, effectiveEnv, configVersion } from '../config.js';
import { getRaw } from '../db.js';

export const CHANNEL_IDS = ['ikas1', 'ikas2', 'trendyol', 'hepsiburada', 'pttavm', 'n11', 'idefix', 'pazarama'];
// Bekleyen kanallar: bilgileri girilip "Bağlantıyı test et" başarılı olana kadar yalnızca Entegrasyonlar'da görünür;
// sipariş, ürün, stok ve analiz ekranlarına ve senkrona girmez. Bilgiler değişirse yeniden onay gerekir.
export const GATED = ['pttavm', 'n11', 'idefix', 'pazarama'];

// Yapılandırma değişmedikçe kanal nesneleri (ve aldıkları erişim belirteçleri) yeniden kullanılır
let cache = null;
export async function getChannels(env, db) {
  const ver = db ? await configVersion(db) : 0;
  if (cache && cache.env === env && cache.ver === ver) return cache.list;
  const cfg = db ? await loadConfig(env, db) : {};
  const e = effectiveEnv(env, cfg);
  const meta = {
    ikas1: { id: 'ikas1', type: 'ikas', name: e.IKAS1_NAME || 'HasTürk', short: e.IKAS1_SHORT || e.IKAS1_NAME || 'HasTürk' },
    ikas2: { id: 'ikas2', type: 'ikas', name: e.IKAS2_NAME || 'Tarım Dünyası', short: e.IKAS2_SHORT || e.IKAS2_NAME || 'Tarım Dünyası' },
    trendyol: { id: 'trendyol', type: 'trendyol', name: 'Trendyol', short: 'Trendyol' },
    hepsiburada: { id: 'hepsiburada', type: 'hepsiburada', name: 'Hepsiburada', short: 'Hepsiburada' },
    pttavm: { id: 'pttavm', type: 'pttavm', name: 'PttAVM', short: 'PttAVM' },
    n11: { id: 'n11', type: 'n11', name: 'N11', short: 'N11' },
    idefix: { id: 'idefix', type: 'idefix', name: 'idefix', short: 'idefix' },
    pazarama: { id: 'pazarama', type: 'pazarama', name: 'Pazarama', short: 'Pazarama' },
  };
  const real = {
    ikas1: ikas(e, 'IKAS1_', meta.ikas1),
    ikas2: ikas(e, 'IKAS2_', meta.ikas2),
    trendyol: trendyol(e, meta.trendyol),
    hepsiburada: hepsiburada(e, meta.hepsiburada),
    pttavm: pttavm(e, meta.pttavm),
    n11: n11(e, meta.n11),
    idefix: idefix(e, meta.idefix),
    pazarama: pazarama(e, meta.pazarama),
  };
  const verified = {};
  if (db) for (const id of GATED) verified[id] = await getRaw(db, 'verified:' + id);
  const list = CHANNEL_IDS.map((id) => {
    // Panelde "pasif" yapılan kanal hiç çalışmaz
    if (cfg[id] && cfg[id].active === false) return { ...real[id], enabled: false, paused: true };
    // Bekleyen kanal: bağlantı onayı (son kayıttan sonra başarılı test) yoksa gizli; test için gerçek bağlantı ayrıca tutulur
    if (GATED.includes(id)) {
      const v = verified[id], ok = v && cfg[id] && v.at >= (cfg[id].updated || 0);
      if (!ok) return { ...real[id], enabled: false, paused: true, gated: true, real: real[id] };
      return real[id];
    }
    // DEMO=1: anahtarı olmayan kanallar örnek veriyle çalışır (anahtarı girilmiş kanal gerçek kalır)
    return env.DEMO === '1' && !real[id].enabled ? demo(meta[id]) : real[id];
  });
  cache = { env, ver, list };
  return list;
}
export const resetChannels = () => { cache = null; };
export const channel = async (env, db, id) => (await getChannels(env, db)).find((c) => c.id === id);
export const publicInfo = (c) => ({ id: c.id, type: c.type, name: c.name, short: c.short, enabled: c.enabled, paused: !!c.paused, gated: !!c.gated, demo: !!c.demo, beta: !!c.beta, missing: c.missing, caps: c.caps });
