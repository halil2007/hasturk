// Kargo entegratörleri: siparişin kargo etiketi kanalın kargo sisteminden değil, bağlanan entegratör firmadan (Kargonomi, Navlungo…) alınır.
// Hangi kanaldan gelirse gelsin (kendi siteniz, pazaryeri) kendi kargo anlaşmanızla gönderilen pakette kullanılır: entegratörde gönderi
// oluşturulur → takip no + kargo firması + etiket pakete yazılır ("kendi anlaşmanızla" gönderim, agreement = 'own') → "Kargoya ver" ile
// takip no kanala bildirilir (kanal destekliyorsa). ikas gibi gönderisi yalnız kendi kargosuyla yapılan kanalda (manualTracking: false) kullanılmaz.
//
// API bilgileri kanallarla aynı yerde, şifreli saklanır (channel_config; alanlar config.js → FIELDS.kargonomi / navlungo).
// Bir entegratörün bağlantısı (adapter) şu işlevleri verir:
//   test()                          → bağlantı / bakiye denemesi, { ok, message }
//   create(shipment)                → { ref, tracking, barcode, carrier, trackingUrl, cost, label: { format: 'pdf'|'zpl'|'png', data (base64 ya da ZPL) } | null }
//   cancel(ref)                     → gönderiyi entegratörde iptal eder
// "ready: false": firmanın API dokümanı henüz elimizde değil; bilgiler kaydedilebilir, gönderi oluşturma açıklamayla reddedilir.
import { loadConfig, describe } from './config.js';
import { getRaw, setSetting } from './db.js';
import { HttpError, str } from './util.js';

export const CARRIERS = {
  kargonomi: {
    id: 'kargonomi', name: 'Kargonomi', site: 'https://www.kargonomi.com.tr', ready: false,
    about: 'Kargo karşılaştırma ve gönderi platformu: Aras, Yurtiçi, Sürat, PTT, HepsiJET, Kolay Gelsin, UPS gibi firmalarla tek hesaptan, bakiye yükleyerek gönderim.',
    howto: 'Kargonomi\'de hesap açın ve destek ekibinden (destek@kargonomi.com.tr · 0850 811 87 97) API erişimi isteyin; verilen bilgileri buraya girin.',
  },
  navlungo: {
    id: 'navlungo', name: 'Navlungo', site: 'https://navlungo.com', ready: false,
    about: 'Yurt içi ve yurt dışı gönderi platformu: tek entegrasyonla 20\'den fazla yerel ve global kargo firması, 230 ülkeye gönderim.',
    howto: 'Navlungo\'da hesap açın ve Navlungo ekibinden API erişimi isteyin; verilen bilgileri buraya girin.',
  },
};
export const CARRIER_IDS = Object.keys(CARRIERS);
export const isCarrierId = (id) => CARRIER_IDS.includes(id) || id === 'demo';

// Deneme modu (DEMO=1): gerçek firmaya gitmeden örnek gönderi oluşturan entegratör (akışı göstermek ve test için)
const DEMO = { id: 'demo', name: 'Örnek entegratör', ready: true, demo: true, about: 'Deneme modu: gerçek kargo firmasına gönderi açmaz, örnek takip numarası verir.' };

// Bağlantılar. Firmanın API dokümanı gelince buraya eklenir (ready: true yapılır); o zamana kadar gönderi oluşturma açıkça reddedilir.
const ADAPTERS = {
  demo: () => ({
    test: async () => ({ ok: true, message: 'Deneme modu: örnek entegratör' }),
    create: async (s) => {
      const n = String(Date.now()).slice(-9);
      return { ref: 'DEMO-' + n, tracking: 'DM' + n, barcode: 'DM' + n, carrier: 'Demo Kargo', trackingUrl: '', cost: Math.round((39.9 + (s.desi || 1) * 6.5) * 100) / 100, label: null };
    },
    cancel: async () => {},
  }),
};

const notReady = (c) => new HttpError(501, `${c.name} bağlantısı hazırlanıyor: firmanın API dokümanı gelince açılacak. Şimdilik etiketi ${c.name} panelinden alıp takip numarasını “Kendi anlaşmamla gönder” ile girebilirsiniz.`);

// Entegratörlerin durumu (Entegrasyonlar ve sipariş ekranı için). withFields: API alanları (gizliler maskeli) da döner
export async function carrierList(env, db, { withFields = false } = {}) {
  const cfg = await loadConfig(env, db), def = await getRaw(db, 'carrier_default');
  const list = Object.values(CARRIERS).map((c) => {
    const d = describe(env, cfg, c.id);
    const missing = d.fields.filter((f) => f.req && !f.source).map((f) => f.label);
    const configured = !missing.length;
    return {
      id: c.id, name: c.name, site: c.site, about: c.about, howto: c.howto, ready: c.ready,
      active: d.active, configured, missing, usable: c.ready && configured && d.active, isDefault: def === c.id, updated: d.updated,
      ...(withFields ? { fields: d.fields } : {}),
    };
  });
  if (env.DEMO === '1') list.push({ ...DEMO, active: true, configured: true, missing: [], usable: true, isDefault: def === 'demo' || !list.some((x) => x.usable) });
  return list;
}

// Kullanılacak entegratör: istenen ya da varsayılan; hazır değil / eksik bilgi / pasifse açıklamalı hata
export async function carrierFor(env, db, id) {
  const list = await carrierList(env, db);
  const c = id ? list.find((x) => x.id === id) : list.find((x) => x.isDefault && x.usable) || list.find((x) => x.usable);
  if (!c) throw new HttpError(400, id ? 'Bilinmeyen kargo entegratörü' : 'Bağlı kargo entegratörü yok: Entegrasyonlar → Kargo entegratörleri bölümünden bağlayın');
  if (!c.ready) throw notReady(c);
  if (!c.active) throw new HttpError(400, `${c.name} pasif: Entegrasyonlar'dan açın`);
  if (!c.configured) throw new HttpError(400, `${c.name}: eksik bilgi (${c.missing.join(', ')})`);
  const values = ((await loadConfig(env, db))[c.id] || {}).values || {};
  const make = ADAPTERS[c.id];
  if (!make) throw notReady(c);
  return { ...c, api: make(env, values) };
}

export async function setDefaultCarrier(db, id) {
  if (id && !isCarrierId(id)) throw new HttpError(400, 'Bilinmeyen kargo entegratörü');
  await setSetting(db, 'carrier_default', id || null);
}

// Entegratöre gidecek gönderi bilgisi (firmadan bağımsız): alıcı siparişten, gönderen Ayarlar → Kargo etiketi → Gönderen'den,
// içerik paketin ürünlerinden. Adres eksikse gönderi açılmaz (kargo firması reddeder; hata burada, anlaşılır biçimde verilir).
export function shipmentOf(o, pkg, sender = {}, { desi } = {}) {
  const a = (o.address && typeof o.address === 'object') ? o.address : (() => { try { return JSON.parse(o.address || '{}') || {}; } catch { return {}; } })();
  const lines = (pkg.items || []).map((x) => {
    const it = (o.items || []).find((i) => String(i.line_id) === String(x.line_id)) || {};
    return { name: it.product_name || it.name || '', sku: it.sku || '', barcode: it.barcode || '', qty: x.qty, unitPrice: Number(it.unit_price) || 0 };
  });
  const s = {
    reference: `${o.order_number || o.id}-${pkg.no}`, orderNumber: o.order_number || '', channel: o.channel,
    receiver: { name: str(a.name || o.customer), phone: str(a.phone || o.phone), email: str(o.email), address: str(a.line), district: str(a.district), city: str(a.city), postalCode: str(a.zip || a.postalCode), country: str(a.country || 'TR') },
    sender: { name: str(sender.name), phone: str(sender.phone), address: str(sender.address), city: str(sender.city) },
    desi: Number(desi) > 0 ? Number(desi) : Number(pkg.desi) > 0 ? Number(pkg.desi) : 1,
    items: lines, value: Math.round(lines.reduce((t, l) => t + l.unitPrice * l.qty, 0) * 100) / 100, currency: o.currency || 'TRY',
  };
  const miss = [];
  if (!s.receiver.name) miss.push('alıcı adı');
  if (!s.receiver.address) miss.push('alıcı adresi');
  if (!s.receiver.city) miss.push('alıcı ili');
  if (!s.sender.name || !s.sender.address) miss.push('gönderen adı / adresi (Ayarlar → Kargo etiketi → Gönderen)');
  return { shipment: s, missing: miss };
}
