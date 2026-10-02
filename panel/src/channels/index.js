// Satış kanalları. Her kanal, Cloudflare'de tanımlı gizli anahtarları varsa etkin olur.
import { ikas } from './ikas.js';
import { trendyol } from './trendyol.js';
import { hepsiburada } from './hepsiburada.js';
import { pttavm } from './pttavm.js';
import { demo } from './demo.js';

export const CHANNEL_IDS = ['ikas1', 'ikas2', 'trendyol', 'hepsiburada', 'pttavm'];

let cache = null, cacheEnv = null;
export function getChannels(env) {
  if (cache && cacheEnv === env) return cache;
  const meta = {
    ikas1: { id: 'ikas1', type: 'ikas', name: env.IKAS1_NAME || 'HasTürk', short: env.IKAS1_SHORT || 'HT' },
    ikas2: { id: 'ikas2', type: 'ikas', name: env.IKAS2_NAME || 'Tarım Dünyası', short: env.IKAS2_SHORT || 'TD' },
    trendyol: { id: 'trendyol', type: 'trendyol', name: 'Trendyol', short: 'TY' },
    hepsiburada: { id: 'hepsiburada', type: 'hepsiburada', name: 'Hepsiburada', short: 'HB' },
    pttavm: { id: 'pttavm', type: 'pttavm', name: 'PttAVM', short: 'PTT' },
  };
  const real = {
    ikas1: ikas(env, 'IKAS1_', meta.ikas1),
    ikas2: ikas(env, 'IKAS2_', meta.ikas2),
    trendyol: trendyol(env, meta.trendyol),
    hepsiburada: hepsiburada(env, meta.hepsiburada),
    pttavm: pttavm(env, meta.pttavm),
  };
  // DEMO=1: anahtarı olmayan kanallar örnek veriyle çalışır (anahtarı girilmiş kanal gerçek kalır)
  cache = CHANNEL_IDS.map((id) => (env.DEMO === '1' && !real[id].enabled ? demo(meta[id]) : real[id]));
  cacheEnv = env;
  return cache;
}
export const channel = (env, id) => getChannels(env).find((c) => c.id === id);
export const publicInfo = (c) => ({ id: c.id, type: c.type, name: c.name, short: c.short, enabled: c.enabled, demo: !!c.demo, beta: !!c.beta, missing: c.missing, caps: c.caps });
