// Satış kanalları. API bilgileri panelden (Entegrasyonlar) ya da Cloudflare gizli değişkenlerinden gelir; panel önceliklidir.
import { ikas } from './ikas.js';
import { trendyol } from './trendyol.js';
import { hepsiburada } from './hepsiburada.js';
import { pttavm } from './pttavm.js';
import { demo } from './demo.js';
import { loadConfig, effectiveEnv, configVersion } from '../config.js';

export const CHANNEL_IDS = ['ikas1', 'ikas2', 'trendyol', 'hepsiburada', 'pttavm'];

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
  };
  const real = {
    ikas1: ikas(e, 'IKAS1_', meta.ikas1),
    ikas2: ikas(e, 'IKAS2_', meta.ikas2),
    trendyol: trendyol(e, meta.trendyol),
    hepsiburada: hepsiburada(e, meta.hepsiburada),
    pttavm: pttavm(e, meta.pttavm),
  };
  const list = CHANNEL_IDS.map((id) => {
    // Panelde "pasif" yapılan kanal hiç çalışmaz. PttAVM şimdilik beklemede: Entegrasyonlar'dan açılana kadar pasif.
    if ((cfg[id] && cfg[id].active === false) || (id === 'pttavm' && !cfg[id])) return { ...real[id], enabled: false, paused: true };
    // DEMO=1: anahtarı olmayan kanallar örnek veriyle çalışır (anahtarı girilmiş kanal gerçek kalır)
    return env.DEMO === '1' && !real[id].enabled ? demo(meta[id]) : real[id];
  });
  cache = { env, ver, list };
  return list;
}
export const resetChannels = () => { cache = null; };
export const channel = async (env, db, id) => (await getChannels(env, db)).find((c) => c.id === id);
export const publicInfo = (c) => ({ id: c.id, type: c.type, name: c.name, short: c.short, enabled: c.enabled, paused: !!c.paused, demo: !!c.demo, beta: !!c.beta, missing: c.missing, caps: c.caps });
