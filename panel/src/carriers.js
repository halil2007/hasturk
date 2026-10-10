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
//   track(pkg)                      → { state: created|transit|delivered|returned|cancelled, text, tracking, trackingUrl, deliveredAt } (durum takibi)
//   label(pkg)                      → etiketi sonradan veren firmalarda (Kargonomi, Navlungo, DHL, Sürat) etiket
// Firma bağlantıları src/carriers/<firma>.js'te. "ready: false": bağlantı henüz yok; bilgiler kaydedilebilir, gönderi açıklamayla reddedilir.
import { loadConfig, describe } from './config.js';
import { getRaw, setSetting, all, run } from './db.js';
import { HttpError, str, pool } from './util.js';
import * as kargonomi from './carriers/kargonomi.js';
import * as navlungo from './carriers/navlungo.js';
import * as hepsijet from './carriers/hepsijet.js';
import * as dhl from './carriers/dhl.js';
import * as ptt from './carriers/ptt.js';
import * as surat from './carriers/surat.js';
import * as ups from './carriers/ups.js';
import * as yurtici from './carriers/yurtici.js';
import * as aras from './carriers/aras.js';

export const CARRIERS = {
  kargonomi: {
    id: 'kargonomi', name: 'Kargonomi', site: 'https://www.kargonomi.com.tr', ready: true,
    about: 'Kargo karşılaştırma ve gönderi platformu: Aras, Yurtiçi, Sürat, PTT, HepsiJET, Kolay Gelsin gibi firmalarla tek hesaptan, bakiye yükleyerek gönderim. Varsayılan olarak en ucuz firma seçilir.',
    howto: 'Kargonomi hesabınızda Depolarım bölümünden gönderen adresinizi (depo) ekleyin. API anahtarını Kargonomi destek ekibinden (destek@kargonomi.com.tr · 0850 811 87 97) isteyip buraya girin. Bakiye yetersizse gönderi açılmaz.',
  },
  navlungo: {
    id: 'navlungo', name: 'Navlungo', site: 'https://navlungo.com', ready: true,
    about: 'Yurt içi gönderi platformu: Sürat, HepsiJET, Kolay Gelsin, Aras, PTT, Yurtiçi gibi firmalarla tek hesaptan, cüzdan bakiyesiyle gönderim.',
    howto: 'Navlungo panelinde Entegrasyonlar bölümünden API kullanıcısı oluşturun (kullanıcı adı / şifre bir kez gösterilir; panel giriş bilgisi çalışmaz). Adres Defteri\'nden gönderici adresi ekleyip numarasını girin. Kargo firmalarınız için fiyat listesi tanımlı olmalı.',
  },
  // ---------- doğrudan kargo firmaları (kendi anlaşmanız) ----------
  // Her firma API erişimini kurumsal müşteri sözleşmesiyle, kendi bölge / şube ekibinden verir.
  hepsijet: { id: 'hepsijet', kind: 'direct', name: 'HepsiJET', site: 'https://www.hepsijet.com', ready: true, color: '#ff6000',
    about: 'Hepsiburada\'nın kargo firması: kendi anlaşmanızla gönderi, etiket (ZPL) ve takip.', howto: 'HepsiJET kurumsal satış ekibinden entegrasyon kullanıcı adı, şifre, firma kodu (ör. ETF) ve çıkış deposu (XDock) kodunu isteyin.' },
  dhl: { id: 'dhl', kind: 'direct', name: 'DHL eCommerce', site: 'https://www.dhlecommerce.com.tr', ready: true, color: '#d40511',
    about: 'DHL eCommerce ile gönderi, etiket (ZPL) ve takip.', howto: 'apizone.mngkargo.com.tr geliştirici portalında uygulama açın (Identity, Standard Command, Barcode Command, Standard Query, CBS Info ürünlerine abone olun) ve Client ID / Secret\'ı girin. Müşteri numaranız ve şifreniz DHL eCommerce şubenizden alınır; canlı erişim onayı için entegrasyon@mngkargo.com.tr adresine yazın.' },
  ptt: { id: 'ptt', kind: 'direct', name: 'PTT Kargo', site: 'https://www.ptt.gov.tr', ready: true, color: '#f6c400',
    about: 'PTT Kargo kurumsal gönderi: barkod, veri yükleme ve takip.', howto: 'PTT Kargo bölge müdürlüğünüzden müşteri numarası, web servis şifresi ve barkod aralığı (12 haneli başlangıç / bitiş) isteyin. Etikete basılan barkod şubede okutulunca gönderi kabul edilir.' },
  surat: { id: 'surat', kind: 'direct', name: 'Sürat Kargo', site: 'https://www.suratkargo.com.tr', ready: true, color: '#e30613',
    about: 'Sürat Kargo web servisiyle gönderi (ön kabul) ve takip.', howto: 'Sürat Kargo şubenizden cari kodunuzu ve web servis şifresini isteyin. Gönderiyi panelden iptal etmek ve Sürat etiketi almak için e-Sürat → profil → Web Servis Şifre bölümünde belirlediğiniz şifreyi de girin.' },
  yurtici: { id: 'yurtici', kind: 'direct', name: 'Yurtiçi Kargo', site: 'https://www.yurticikargo.com', ready: true, color: '#1d3e8c',
    about: 'Yurtiçi Kargo web servisiyle gönderi ve takip: etikete basılan barkod şubede okutulunca Yurtiçi gönderi kodu verilir.', howto: 'Yurtiçi Kargo şubenizden gönderici ödemeli web servis kullanıcı adı ve şifresi (wsUserName / wsPassword) isteyin.' },
  aras: { id: 'aras', kind: 'direct', name: 'Aras Kargo', site: 'https://www.araskargo.com.tr', ready: true, color: '#c8102e',
    about: 'Aras Kargo web servisiyle gönderi, Aras etiketi (barkod yetkili hesaplarda) ve takip.', howto: 'Aras Kargo şubenizden ya da entegrasyon ekibinden (entegrasyonekibi@araskargo.com.tr) sevkiyat entegrasyonu kullanıcı adı ve şifresi isteyin. Kargo durumu takibi için esasweb.araskargo.com.tr → Tanımlamalar → Entegrasyon → XML Servisleri bölümünden kullanıcı oluşturup müşteri kodunuzla girin.' },
  ups: { id: 'ups', kind: 'direct', name: 'UPS Kargo', site: 'https://www.ups.com.tr', ready: true, color: '#351c15',
    about: 'UPS Türkiye web servisiyle yurt içi gönderi, etiket ve takip.', howto: 'UPS Türkiye satış temsilcinizden müşteri numarası ve web servis kullanıcı adı / şifresi isteyin (takip için ayrı kullanıcı verildiyse onu da girin).' },
};
// Firma bağlantıları (make(values, { db }) → { test, create, cancel, track, label })
const MODULES = { kargonomi, navlungo, hepsijet, dhl, ptt, surat, ups, yurtici, aras };
export const CARRIER_IDS = Object.keys(CARRIERS);
export const isCarrierId = (id) => CARRIER_IDS.includes(id) || id === 'demo';

// Deneme modu (DEMO=1): gerçek firmaya gitmeden örnek gönderi oluşturan entegratör (akışı göstermek ve test için)
const DEMO = { id: 'demo', name: 'Anlaşmalı kargo', ready: true, demo: true, about: 'Kendi anlaşmalı kargo firmanızla etiket ve takip numarası (demo).' };

// Bağlantılar: deneme modundaki örnek entegratör + firma modülleri
const ADAPTERS = {
  ...Object.fromEntries(Object.entries(MODULES).map(([k, m]) => [k, (env, values, ctx) => m.make(values, ctx)])),
  demo: () => ({
    test: async () => ({ ok: true, message: 'Deneme modu: örnek entegratör' }),
    track: async () => ({ state: null }),
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
      id: c.id, kind: c.kind || 'integrator', color: c.color || '', name: c.name, site: c.site, about: c.about, howto: c.howto, ready: c.ready,
      active: d.active, configured, missing, usable: c.ready && configured && d.active, isDefault: def === c.id, updated: d.updated,
      ...(withFields ? { fields: d.fields } : {}),
    };
  });
  if ((env.DEMO === '1' || env.DEMO_CARRIER === '1')) list.push({ ...DEMO, active: true, configured: true, missing: [], usable: true, isDefault: def === 'demo' || !list.some((x) => x.usable) });
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
  return { ...c, api: make(env, values, { db }) };
}

export async function setDefaultCarrier(db, id) {
  if (id && !isCarrierId(id)) throw new HttpError(400, 'Bilinmeyen kargo entegratörü');
  await setSetting(db, 'carrier_default', id || null);
}

// Entegratöre gidecek gönderi bilgisi (firmadan bağımsız): alıcı siparişten, gönderen Ayarlar → Kargo etiketi → Gönderen'den,
// içerik paketin ürünlerinden. Adres eksikse gönderi açılmaz (kargo firması reddeder; hata burada, anlaşılır biçimde verilir).
// Gönderen il / ilçesi: Ayarlar'daki "İlçe / il" alanından ("Selçuklu / Konya", "Selçuklu, Konya", "Selçuklu Konya" ya da yalnız "Konya")
export function senderPlace(sender = {}) {
  const raw = str(sender.city);
  if (sender.district) return { district: str(sender.district), city: raw };
  const parts = raw.split(/\s*[/,-]\s*/).filter(Boolean);
  if (parts.length >= 2) return { district: parts[0], city: parts[parts.length - 1] };
  const w = raw.split(/\s+/);
  return w.length >= 2 ? { district: w.slice(0, -1).join(' '), city: w[w.length - 1] } : { district: '', city: raw };
}

export function shipmentOf(o, pkg, sender = {}, { desi } = {}) {
  const a = (o.address && typeof o.address === 'object') ? o.address : (() => { try { return JSON.parse(o.address || '{}') || {}; } catch { return {}; } })();
  const lines = (pkg.items || []).map((x) => {
    const it = (o.items || []).find((i) => String(i.line_id) === String(x.line_id)) || {};
    return { name: it.product_name || it.name || '', sku: it.sku || '', barcode: it.barcode || '', qty: x.qty, unitPrice: Number(it.unit_price) || 0 };
  });
  const s = {
    reference: `${o.order_number || o.id}-${pkg.no}`, orderNumber: o.order_number || '', channel: o.channel,
    receiver: { name: str(a.name || o.customer), phone: str(a.phone || o.phone), email: str(o.email), address: str(a.line), district: str(a.district), city: str(a.city), postalCode: str(a.zip || a.postalCode), country: str(a.country || 'TR') },
    sender: { name: str(sender.name), phone: str(sender.phone), address: str(sender.address), ...senderPlace(sender) },
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

// ---------- kargo durumu takibi (her senkronda, paket başına en sık 2 saatte bir) ----------
// Firma gönderisi açılmış paketler son 30 gün içinde sorgulanır: gerçek takip numarası (şube kabulünden sonra veren firmalar),
// takip adresi ve kargo ücreti pakete yazılır; kargoya verilmiş paketlerin hepsi teslim edildiyse sipariş "Teslim edildi" olur.
const TRACK_EVERY = 2 * 3600e3;
export async function trackCarriers(env, db, { limit = 40, force = false } = {}) {
  const t = Date.now();
  const rows = await all(db, `SELECT p.id, p.order_id, p.no, p.status, p.tracking, p.barcode, p.tracking_url, p.carrier_provider, p.carrier_ref, p.carrier_cost, p.carrier_state, p.desi,
      o.status AS order_status, o.shipping_src FROM packages p JOIN orders o ON o.id = p.order_id
    WHERE p.carrier_provider IS NOT NULL AND p.carrier_provider != 'demo' AND p.carrier_ref IS NOT NULL
      AND COALESCE(p.carrier_state, '') NOT IN ('delivered', 'cancelled') AND o.status NOT IN ('cancelled', 'returned', 'delivered')
      AND COALESCE(p.label_at, p.created_at, 0) >= ? AND (? OR COALESCE(p.carrier_checked_at, 0) < ?)
    ORDER BY COALESCE(p.carrier_checked_at, 0) LIMIT ?`, t - 30 * 86400e3, force ? 1 : 0, t - TRACK_EVERY, limit);
  if (!rows.length) return { checked: 0 };
  const apis = {}, out = { checked: 0, delivered: 0, updated: 0, errors: 0 };
  await pool(rows, 4, async (p) => {
    try {
      if (!(p.carrier_provider in apis)) apis[p.carrier_provider] = await carrierFor(env, db, p.carrier_provider).catch(() => null);
      const c = apis[p.carrier_provider];
      if (!c || !c.api.track) { await run(db, 'UPDATE packages SET carrier_checked_at = ? WHERE id = ?', t, p.id); return; }
      const r = (await c.api.track(p)) || {};
      out.checked++;
      const tn = str(r.tracking);
      // Firmanın kendi takip numarası geldiyse (ön kabul → şube kabulü) pakete yazılır
      if (tn && tn !== p.tracking) { out.updated++; await run(db, 'UPDATE packages SET tracking = ?, tracking_url = COALESCE(NULLIF(?, \'\'), tracking_url) WHERE id = ?', tn, str(r.trackingUrl), p.id); }
      else if (r.trackingUrl && !p.tracking_url) await run(db, 'UPDATE packages SET tracking_url = ? WHERE id = ?', str(r.trackingUrl), p.id);
      if (r.cost != null && p.carrier_cost == null) {
        await run(db, 'UPDATE packages SET carrier_cost = ? WHERE id = ?', r.cost, p.id);
        if (p.shipping_src !== 'manual') await run(db, "UPDATE orders SET shipping_cost = COALESCE(shipping_cost, 0) + ?, shipping_src = 'carrier' WHERE id = ?", r.cost, p.order_id);
      }
      await run(db, 'UPDATE packages SET carrier_checked_at = ?, carrier_state = COALESCE(?, carrier_state), carrier_status = COALESCE(NULLIF(?, \'\'), carrier_status) WHERE id = ?', t, r.state || null, str(r.text).slice(0, 200), p.id);
      if (r.state && r.state !== p.carrier_state && ['delivered', 'returned'].includes(r.state)) {
        await run(db, "INSERT INTO order_events (order_id, at, source, action, status, note, user) VALUES (?, ?, 'carrier', 'carrier_track', ?, ?, 'Sistem')",
          p.order_id, t, r.state, `Paket ${p.no}: ${c.name} · ${str(r.text) || (r.state === 'delivered' ? 'Teslim edildi' : 'İade')}`.slice(0, 300));
      }
      if (r.state === 'delivered') out.delivered++;
    } catch (e) {
      out.errors++;
      await run(db, 'UPDATE packages SET carrier_checked_at = ? WHERE id = ?', t, p.id);
    }
  });
  // Kargoya verilmiş ve firmanın teslim ettiği siparişler: tüm paketleri teslim edildiyse sipariş "Teslim edildi"
  const done = await all(db, `SELECT o.id FROM orders o WHERE o.status = 'shipped' AND EXISTS (SELECT 1 FROM packages p WHERE p.order_id = o.id AND p.carrier_state = 'delivered')
    AND NOT EXISTS (SELECT 1 FROM packages p WHERE p.order_id = o.id AND (p.status != 'shipped' OR COALESCE(p.carrier_state, '') != 'delivered')) LIMIT 200`);
  for (const o of done) {
    await run(db, "UPDATE orders SET status = 'delivered', local_status = 'delivered', updated_at = ? WHERE id = ? AND status = 'shipped'", t, o.id);
    await run(db, "INSERT INTO order_events (order_id, at, source, action, status, note, user) VALUES (?, ?, 'carrier', 'status', 'delivered', 'Kargo firması teslim edildi bildirdi', 'Sistem')", o.id, t);
  }
  out.closed = done.length;
  return out;
}
