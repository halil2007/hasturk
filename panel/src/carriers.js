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
import { getRaw, setSetting, getSettings, all, run, first, notify } from './db.js';
import { getChannels } from './channels/index.js';
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
import * as kolaygelsin from './carriers/kolaygelsin.js';
import * as sendeo from './carriers/sendeo.js';
import * as dhlexpress from './carriers/dhlexpress.js';

export const CARRIERS = {
  kargonomi: {
    id: 'kargonomi', name: 'Kargonomi', site: 'https://www.kargonomi.com.tr', ready: true,
    about: 'Kargo karşılaştırma ve gönderi platformu: Aras, Yurtiçi, Sürat, PTT, HepsiJET, Kolay Gelsin gibi firmalarla tek hesaptan, bakiye yükleyerek gönderim. İnternet sitenizin siparişlerinde; kargo firmasını her gönderide fiyatlarını görerek siz seçersiniz.',
    // Kargonomi API anahtarını (token) yalnız kendi müşterisine, hesabına bağlı olarak ve e-postayla verir (telefonla verilmez):
    // her firma kendi Kargonomi hesabı için destek@kargonomi.com.tr adresinden ister. Panel e-postayı hazır metinle açar (mail).
    howto: 'Kargonomi API anahtarını (token) yalnızca kendi müşterilerine, e-postayla verir; telefonla verilmez. Önce Kargonomi hesabınızı açın, Depolarım bölümünden gönderen adresinizi (depo) ekleyin. Sonra Kargonomi\'de kayıtlı e-posta adresinizden destek@kargonomi.com.tr adresine yazıp hesabınız için API token isteyin (aşağıdaki “E-postayı hazırla” ile metin hazır gelir). Gelen token\'ı buraya girin. Bakiye yetersizse gönderi açılmaz.',
    mail: { to: 'destek@kargonomi.com.tr', subject: 'API token talebi (Hastürk CRM entegrasyonu)',
      body: 'Merhaba,\n\nKargonomi hesabımı sipariş yönetim panelim Hastürk CRM\'ye bağlayıp gönderileri API ile oluşturmak istiyorum. Hesabım için API erişim anahtarı (token) iletebilir misiniz?\n\nKargonomi hesap e-postası: \nFirma adı: \nVergi no: \n\nTeşekkürler.' },
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
  kolaygelsin: { id: 'kolaygelsin', kind: 'direct', beta: true, name: "Kolay Gelsin", site: "https://www.kolaygelsin.com", ready: true, color: "#00a651",
    about: "Kolay Gelsin entegrasyon servisiyle kendi anlaşmanızla gönderi ve takip: etiketi panel basar (Kolay Gelsin müşteri barkoduyla taşır), takip numarası Kolay Gelsin gönderi numarasıdır. (Test aşamasında)", howto: "Kolay Gelsin kurumsal satış ekibinden entegrasyon token'ı, müşteri numaranız (CustomerId) ve gönderen adres numaranızı (AddressId) isteyin. Takip durumlarının dönmesi için Kolay Gelsin panelinde \"Webhook Ayarlar\" sekmesinden izlemek istediğiniz gönderi durumlarını seçin." },
  sendeo: { id: 'sendeo', kind: 'direct', beta: true, name: "Sendeo", site: "https://www.sendeo.com.tr", ready: true, color: "#00b140",
    about: "Sendeo web servisiyle kendi anlaşmanızla gönderi (iş emri), Sendeo etiketi (ZPL) ve takip. (Test aşamasında)", howto: "Sendeo Kurumsal Satış ekibinden canlı ortam web servis müşteri adı ve şifresini isteyin (entegrasyon testleri ortak test hesabıyla yapılır). Gönderen il / ilçesi Ayarlar → Kargo etiketi → Gönderen'deki “İlçe / il” alanından okunur." },
  dhlexpress: { id: 'dhlexpress', kind: 'direct', beta: true, name: "DHL Express", site: "https://www.dhl.com/tr-tr/home/express.html", ready: true, color: "#ffcc00",
    about: "DHL Express Türkiye (MyDHL API) ile yurt içi ekspres gönderi, PDF etiket ve takip; gönderiler DHL Express hesabınıza faturalanır. (Test aşamasında)", howto: "developer.dhl.com'da hesap açıp \"MyDHL API (DHL Express)\" için uygulama oluşturun; API Key / Secret test için hemen, canlı erişim DHL Express Türkiye satış temsilcinizin onayıyla verilir. DHL Express gönderen (shipper) hesap numaranızı girin. Kurye çağırma bu bağlantıda yok: gönderiyi şubeye verin ya da düzenli alım anlaşmanızı kullanın." },
};
// Firma bağlantıları (make(values, { db }) → { test, create, cancel, track, label })
const MODULES = { kargonomi, navlungo, hepsijet, dhl, ptt, surat, ups, yurtici, aras, kolaygelsin, sendeo, dhlexpress };
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
      id: c.id, kind: c.kind || 'integrator', color: c.color || '', name: c.name, site: c.site, about: c.about, howto: c.howto, mail: c.mail || null, ready: c.ready,
      active: d.active, configured, missing, usable: c.ready && configured && d.active, isDefault: def === c.id, updated: d.updated,
      prefer: c.id === 'kargonomi' ? str(((cfg[c.id] || {}).values || {}).KARGONOMI_PROVIDER) : '',
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
  const api = make(env, values, { db });
  // İptalden sonra yeniden açılan gönderide referans eki: firma aynı referansı "zaten var" sayıp iptal edilmiş gönderiyi döndürmesin
  if (api.create && db) { const create = api.create.bind(api); api.create = async (s, opts) => create(await withAttempt(db, s), opts); }
  return { ...c, api };
}

// Paketin daha önce iptal edilmiş entegratör gönderisi sayısı (order_events 'carrier-cancel', not "Paket N: …") → referans "-R<n>" eki.
// İlk gönderide referans değişmez (yanıtı kaybolan isteğin yeniden denemesi aynı referansla firmadaki gönderiyi bulur).
export async function withAttempt(db, s) {
  if (!s || !s.orderId || s.packageNo == null) return s;
  try {
    const r = await first(db, "SELECT COUNT(*) AS n FROM order_events WHERE order_id = ? AND action = 'carrier-cancel' AND note LIKE ?", s.orderId, `Paket ${s.packageNo}:%`);
    const n = Number(r && r.n) || 0;
    return n ? { ...s, reference: `${s.reference}-R${n}`, attempt: n } : s;
  } catch { return s; }
}

// Kapıda ödemeli sipariş: hiçbir kargo bağlantısı tahsilatlı (kapıda ödeme) gönderi açmıyor; gönderi tahsilatsız açılırsa
// ürün parası tahsil edilmeden teslim edilir. Kanal bağdaştırıcıları siparişe extra.cod = true yazar (WooCommerce payment_method 'cod',
// ikas paymentMethods.type *_ON_DELIVERY, OpenCart payment_code 'cod', T-Soft / Ticimax ödeme tipi adı "Kapıda …").
export const COD_MSG = 'Kapıda ödemeli sipariş: anlaşmalı kargo entegrasyonuyla gönderilemez; tahsilatlı gönderi için kargo firmasının panelini kullanın';
export function codBlocked(o) {
  let x = o && o.extra;
  if (typeof x === 'string') { try { x = JSON.parse(x); } catch { x = null; } }
  return x && x.cod ? COD_MSG : '';
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
  const cod = codBlocked(o);
  if (cod) throw new HttpError(400, cod);
  const a = (o.address && typeof o.address === 'object') ? o.address : (() => { try { return JSON.parse(o.address || '{}') || {}; } catch { return {}; } })();
  const lines = (pkg.items || []).map((x) => {
    const it = (o.items || []).find((i) => String(i.line_id) === String(x.line_id)) || {};
    return { name: it.product_name || it.name || '', sku: it.sku || '', barcode: it.barcode || '', qty: x.qty, unitPrice: Number(it.unit_price) || 0 };
  });
  const s = {
    reference: `${o.order_number || o.id}-${pkg.no}`, orderNumber: o.order_number || '', channel: o.channel, orderId: o.id, packageNo: pkg.no,
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

// Kargo ücreti KDV dahil saklanır (sipariş kârı kargo giderini KDV dahil kabul eder): firma KDV hariç bildiriyorsa %20 eklenir
export const grossCost = (r) => (r.cost == null ? null : Math.round(Number(r.cost) * (r.costVatIncluded === false ? 1.2 : 1) * 100) / 100);

// ---------- kargo durumu takibi (her senkronda, paket başına en sık 2 saatte bir) ----------
// Firma gönderisi açılmış paketler son 30 gün içinde sorgulanır: gerçek takip numarası (şube kabulünden sonra veren firmalar),
// takip adresi ve kargo ücreti pakete yazılır; kargoya verilmiş paketlerin hepsi teslim edildiyse sipariş "Teslim edildi" olur.
const TRACK_EVERY = 2 * 3600e3;
// Teslim edildi → siteye (ikas / WooCommerce: paket "Teslim edildi"). Kanal o an hata verirse yarım saat arayla 8 kez yeniden
// denenir (site_sync: e1..e8), olmazsa bildirim gider. Pazaryeri (markDelivered yok) teslimi kendisi bilir: 'skip'
const SYNC_TRIES = 8, SYNC_GAP = 30 * 60e3;
async function syncDelivered(db, chans, out, t) {
  const del = await all(db, `SELECT p.id, p.order_id, p.no, p.status, p.remote_id, p.agreement, p.carrier_provider, p.tracking, p.barcode, p.cargo_company, p.tracking_url,
      p.site_sync, o.channel AS order_channel, o.remote_id AS order_remote FROM packages p JOIN orders o ON o.id = p.order_id
    WHERE p.carrier_provider IS NOT NULL AND p.carrier_provider != 'demo' AND p.carrier_state = 'delivered' AND p.status = 'shipped'
      AND (p.site_sync IS NULL OR (p.site_sync LIKE 'e%' AND COALESCE(p.carrier_checked_at, 0) < ?)) AND COALESCE(p.carrier_checked_at, 0) >= ?
    ORDER BY p.carrier_checked_at LIMIT 40`, t - SYNC_GAP, t - 14 * 86400e3);
  for (const p of del) {
    const ch = chans.get(p.order_channel);
    // Kanal kaldırılmış / teslimi kendisi bilen kanal (pazaryeri): bildirilmez. Geçici kapalı kanal hata sayılır (yeniden denenir)
    if (!ch || !ch.markDelivered) { await run(db, "UPDATE packages SET site_sync = 'skip' WHERE id = ?", p.id); continue; }
    try {
      if (!ch.enabled) throw new Error(`${ch.name} şu an kapalı / beklemede`);
      await ch.markDelivered({ remote_id: p.order_remote, id: p.order_id }, p);
      await run(db, "UPDATE packages SET site_sync = 'delivered' WHERE id = ?", p.id);
      out.synced++;
    } catch (e) {
      const n = (Number(String(p.site_sync || '').slice(1)) || 0) + 1, msg = String(e.message).slice(0, 300);
      await run(db, 'UPDATE packages SET site_sync = ?, carrier_checked_at = ? WHERE id = ?', n >= SYNC_TRIES ? 'fail' : 'e' + n, t, p.id);
      await run(db, "INSERT INTO logs (at, channel, level, msg) VALUES (?, ?, 'warn', ?)", Date.now(), p.order_channel, `Paket ${p.no} (${p.order_id}): "teslim edildi" siteye yazılamadı (${n}. deneme): ${msg}`).catch(() => {});
      if (n >= SYNC_TRIES) await notify(db, `carrier:sitesync:${p.id}`, { level: 'warn', title: `Paket ${p.no}: "teslim edildi" siteye yazılamadı`, msg: `${ch.name} ${SYNC_TRIES} denemede kabul etmedi (${msg}). Siparişi sitenizin panelinden "Teslim edildi" yapın. Sipariş: ${p.order_id}` });
    }
  }
}

// Kanalda paketi iptal edilen / siparişi iptal edilen pakette açık kalan entegratör gönderisi (ücretli): bkz. sync.js saveOrders
export const ORPHAN_MSG = 'Kanalda bu paket iptal edildi ama kargo entegratörü gönderisi hâlâ açık (ücretli). Göndermeyecekseniz paket menüsünden “Entegratör gönderisini iptal et”.';
const SHIP_TRIES = 6;

export async function trackCarriers(env, db, { limit = 40, force = false } = {}) {
  const t = Date.now();
  // İptal / iade edilen siparişin açık gönderisi de izlenir: firmanın iptali işlenir, açık kalan ücretli gönderi bildirilir
  const rows = await all(db, `SELECT p.id, p.order_id, p.no, p.status, p.tracking, p.barcode, p.tracking_url, p.cargo_company, p.carrier_provider, p.carrier_ref, p.carrier_cost, p.carrier_state, p.desi,
      p.remote_id, p.agreement, p.error, p.site_tracking, p.ship_sync, o.status AS order_status, o.order_number, o.channel AS order_channel, o.remote_id AS order_remote FROM packages p JOIN orders o ON o.id = p.order_id
    WHERE p.carrier_provider IS NOT NULL AND p.carrier_provider != 'demo' AND p.carrier_ref IS NOT NULL
      AND COALESCE(p.carrier_state, '') NOT IN ('delivered', 'cancelled', 'failed') AND o.status != 'delivered'
      AND COALESCE(p.label_at, p.created_at, 0) >= ? AND (? OR COALESCE(p.carrier_checked_at, 0) < ?)
    ORDER BY COALESCE(p.carrier_checked_at, 0) LIMIT ?`, t - 30 * 86400e3, force ? 1 : 0, t - TRACK_EVERY, limit);
  const apis = {}, out = { checked: 0, delivered: 0, updated: 0, errors: 0, shipped: 0, synced: 0 };
  // Siteye otomatik bildirim (Ayarlar → Kargo: carrier_auto_ship): firma teslim alınca "Kargoya ver", sonradan gelen takip kodu,
  // teslim edildi. Kanal hatası takibi durdurmaz (günlüğe yazılır, sonraki turlarda yeniden denenir, olmazsa bildirim)
  const settings = await getSettings(db).catch(() => ({})), auto = settings.carrier_auto_ship !== false;
  // Firma teslim aldı ama "Kargoya ver" yapılamadı (kanal hatası, sipariş kilitli): teslim edilmiş paket takipten çıktığı için ayrıca denenir
  const reship = auto ? await all(db, `SELECT p.id, p.order_id, p.no, p.status, p.ship_sync, p.carrier_state, o.channel AS order_channel, o.order_number FROM packages p JOIN orders o ON o.id = p.order_id
    WHERE p.carrier_ref IS NOT NULL AND p.status = 'open' AND p.carrier_state = 'delivered' AND o.status NOT IN ('cancelled', 'returned', 'delivered')
      AND COALESCE(p.ship_sync, '') != 'fail' AND COALESCE(p.carrier_checked_at, 0) < ? LIMIT 20`, t - 30 * 60e3) : [];
  if (!rows.length && !reship.length && !(auto && await first(db, `SELECT 1 FROM packages WHERE carrier_state = 'delivered' AND carrier_provider IS NOT NULL AND (site_sync IS NULL OR site_sync LIKE 'e%') LIMIT 1`))) return { checked: 0 };
  let chOk = true;
  const chans = auto ? new Map((await getChannels(env, db).catch(() => { chOk = false; return []; })).map((c) => [c.id, c])) : new Map();
  const after = [];
  const warnLog = (p, msg) => run(db, "INSERT INTO logs (at, channel, level, msg) VALUES (?, ?, 'warn', ?)", Date.now(), p.order_channel, `Paket ${p.no} (${p.order_id}): ${String(msg).slice(0, 300)}`).catch(() => {});
  await pool(rows, 4, async (p) => {
    // Okuma ile yazma arasında gönderi iptal / yenilendiyse eski gönderinin bilgisi yeni pakete yazılmasın
    const upd = (sql, ...args) => run(db, `${sql} AND carrier_ref = ?`, ...args, p.carrier_ref);
    try {
      if (!(p.carrier_provider in apis)) apis[p.carrier_provider] = await carrierFor(env, db, p.carrier_provider).catch(() => null);
      const c = apis[p.carrier_provider];
      if (!c || !c.api.track) { await upd('UPDATE packages SET carrier_checked_at = ? WHERE id = ?', t, p.id); return; }
      const r = (await c.api.track(p)) || {};
      out.checked++;
      // Gönderi kesin iptal edildi (panelden istenen iptal onaylandı ya da Kargonomi / kargo firması iptal etti): ücret geri alınır,
      // paket serbest kalır (yeniden gönderilebilir). Kilit doluysa durum yazılmaz, sonraki turda yeniden denenir
      if (r.state === 'cancelled') {
        const asked = p.carrier_state === 'cancelling';
        if (p.status === 'open') {
          const { carrierCancelDone } = await import('./api.js');
          try { await carrierCancelDone(env, db, p.order_id, p.id, asked ? 'iptal talebi onaylandı' : `${c.name} tarafında iptal edildi`); } catch (e) {
            await upd('UPDATE packages SET carrier_checked_at = ? WHERE id = ?', t, p.id); await warnLog(p, `iptal işlenemedi, yeniden denenecek: ${e.message}`); return;
          }
          if (!asked) await notify(db, `carrier:cancelled:${p.id}`, { level: 'warn', title: `Paket ${p.no}: ${c.name} gönderisi iptal edildi`, msg: `Sipariş #${p.order_number}: gönderi ${c.name} tarafında iptal edildi; etiket geçersiz. Ücret kargo giderinden düşüldü, paket yeniden gönderilebilir.` });
        } else {
          await upd("UPDATE packages SET carrier_state = 'cancelled', carrier_status = ?, carrier_checked_at = ? WHERE id = ?", str(r.text) || 'İptal edildi', t, p.id);
          await notify(db, `carrier:cancelled:${p.id}`, { level: 'warn', title: `Paket ${p.no}: ${c.name} gönderisi iptal edildi`, msg: `Sipariş #${p.order_number} kargoya verilmiş görünüyordu ama gönderi ${c.name} tarafında iptal edildi. ${c.name} panelinden kontrol edin.` });
        }
        return;
      }
      // İptal talebi kabul edilmedi (gönderi devam ediyor): kullanıcıya bildirilir, takip olağan sürer
      if (p.carrier_state === 'cancelling' && r.state && r.state !== 'cancelling') {
        await notify(db, `carrier:cancelno:${p.id}`, { level: 'warn', title: `Paket ${p.no}: ${c.name} iptal talebi kabul edilmedi`, msg: `Sipariş #${p.order_number}: gönderi devam ediyor (${str(r.text) || r.state}). Kargo firması paketi aldıysa iptal ${c.name} panelinden / müşteri iadesiyle yapılır.` });
      }
      const tn = str(r.tracking);
      // Firmanın kendi takip numarası geldiyse (ön kabul → şube kabulü) pakete yazılır
      if (tn && tn !== p.tracking) { out.updated++; await upd('UPDATE packages SET tracking = ?, tracking_url = COALESCE(NULLIF(?, \'\'), tracking_url) WHERE id = ?', tn, str(r.trackingUrl), p.id); }
      else if (r.trackingUrl && !p.tracking_url) await upd('UPDATE packages SET tracking_url = ? WHERE id = ?', str(r.trackingUrl), p.id);
      // Firmanın barkodu sonradan geldiyse (etiket bizim tasarımla bu barkodla basılır)
      if (str(r.barcode) && !p.barcode) await upd("UPDATE packages SET barcode = ? WHERE id = ? AND COALESCE(barcode, '') = ''", str(r.barcode), p.id);
      // Kargo firması adı (gönderi açılırken okunamadıysa entegratör adı yazılmıştı): "Kargoya ver" pazaryerine doğru firmayı bildirsin
      const cn = str(r.carrier);
      if (cn && cn !== c.name && (!p.cargo_company || p.cargo_company === c.name)) await upd('UPDATE packages SET cargo_company = ? WHERE id = ?', cn, p.id);
      // Ücret: ilk gelen yazılır; firma sonradan gerçek ücreti verirse (costFinal) tahmini ücretin yerine geçer, sipariş kargo gideri farkla düzeltilir
      const cost = r.cost != null ? grossCost(r) : null;
      if (cost != null && r.state !== 'failed' && (p.carrier_cost == null || (r.costFinal && Math.abs(cost - Number(p.carrier_cost)) >= 0.01))) {
        const delta = Math.round((cost - (Number(p.carrier_cost) || 0)) * 100) / 100;
        const x = await upd('UPDATE packages SET carrier_cost = ? WHERE id = ?', cost, p.id);
        if (x && x.meta && x.meta.changes) await run(db, "UPDATE orders SET shipping_cost = MAX(0, COALESCE(shipping_cost, 0) + ?), shipping_src = 'carrier' WHERE id = ? AND COALESCE(shipping_src, '') != 'manual'", delta, p.order_id);
      }
      // Firma gönderiyi oluşturamadı (onaydan sonra gelir): pakete hata yazılır, tahmini ücret geri alınır, bildirim gider
      if (r.state === 'failed' && p.carrier_state !== 'failed') {
        const msg = `${c.name}: kargo firması gönderiyi oluşturamadı${r.text ? ` (${str(r.text)})` : ''}. Gönderiyi iptal edip yeniden oluşturun.`;
        const was = Number(p.carrier_cost) || 0;
        const x = await upd('UPDATE packages SET error = ?, carrier_cost = NULL WHERE id = ?', msg.slice(0, 300), p.id);
        if (was && x && x.meta && x.meta.changes) await run(db, "UPDATE orders SET shipping_cost = MAX(0, COALESCE(shipping_cost, 0) - ?) WHERE id = ? AND shipping_src = 'carrier'", was, p.order_id);
        await notify(db, `carrier:failed:${p.id}`, { level: 'error', title: `Paket ${p.no}: ${c.name} gönderisi oluşturulamadı`, msg: msg + ` Sipariş: #${p.order_number}` });
      }
      await upd('UPDATE packages SET carrier_checked_at = ?, carrier_state = COALESCE(?, carrier_state), carrier_status = COALESCE(NULLIF(?, \'\'), carrier_status) WHERE id = ?', t, r.state || null, str(r.text).slice(0, 200), p.id);
      if (r.state && r.state !== p.carrier_state && ['delivered', 'returned'].includes(r.state)) {
        await run(db, "INSERT INTO order_events (order_id, at, source, action, status, note, user) VALUES (?, ?, 'carrier', 'carrier_track', ?, ?, 'Sistem')",
          p.order_id, t, r.state, `Paket ${p.no}: ${c.name} · ${str(r.text) || (r.state === 'delivered' ? 'Teslim edildi' : 'İade')}`.slice(0, 300));
      }
      if (r.state === 'delivered') out.delivered++;
      // Sipariş iptal / iade edildi ya da kanalda paket iptal edildi ama gönderi açık (kargoya verilmemiş): ücretli gönderi unutulmasın
      if (p.status === 'open' && !['cancelling', 'transit', 'delivered'].includes(r.state) && (['cancelled', 'returned'].includes(p.order_status) || p.error === ORPHAN_MSG)) {
        await notify(db, `carrier:orphan:${p.id}`, { level: 'warn', title: `Paket ${p.no}: ${c.name} gönderisi açık kaldı`, msg: `Sipariş #${p.order_number} ${p.order_status === 'cancelled' ? 'iptal edildi' : p.order_status === 'returned' ? 'iade edildi' : 'kanalda paketi iptal edildi'} ama ${c.name} gönderisi açık (ücretli). Kargo firmasına vermeyecekseniz siparişin paket menüsünden “Entegratör gönderisini iptal et”.` });
      }
      if (auto && chOk) after.push({ p, r, tn: tn || '', cn });
    } catch (e) {
      out.errors++;
      await upd('UPDATE packages SET carrier_checked_at = ? WHERE id = ?', t, p.id).catch(() => {});
    }
  });
  // "Kargoya ver" denemesi başarısız: sayaç (ship_sync e1…), SHIP_TRIES denemeden sonra bildirim
  const shipFail = async (p, e) => {
    const n = (Number(String(p.ship_sync || '').replace(/^e/, '')) || 0) + 1;
    await run(db, 'UPDATE packages SET ship_sync = ? WHERE id = ?', n >= SHIP_TRIES ? 'fail' : 'e' + n, p.id);
    await warnLog(p, `kargo firması teslim aldı ama "Kargoya ver" yapılamadı (${n}. deneme): ${e.message}`);
    if (n >= SHIP_TRIES) await notify(db, `carrier:ship:${p.id}`, { level: 'warn', title: `Paket ${p.no}: "Kargoya ver" kendiliğinden yapılamadı`, msg: `Sipariş #${p.order_number}: kargo firması paketi teslim aldı ama ${SHIP_TRIES} denemede kanala bildirilemedi (${String(e.message).slice(0, 200)}). Paketi panelden “Kargoya ver” ile gönderin.` });
  };
  // Kanala bildirim (sırayla: aynı siparişin paketleri kilitle işlenir)
  for (const { p, r, tn, cn } of after) {
    const ch = chans.get(p.order_channel);
    const live = !['cancelled', 'returned', 'delivered'].includes(p.order_status);
    // Firma paketi teslim aldı (yolda / teslim edildi) ve paket hâlâ açık: "Kargoya ver" — takip bilgisi kanala gider (başarısızsa her turda yeniden)
    if (live && p.status === 'open' && ['transit', 'delivered'].includes(r.state) && p.ship_sync !== 'fail') {
      try {
        const { autoShip } = await import('./api.js');
        await autoShip(env, db, p.order_id, p.id);
        out.shipped++;
        p.status = 'shipped';
        await run(db, 'UPDATE packages SET ship_sync = NULL WHERE id = ?', p.id);
      } catch (e) { await shipFail(p, e); }
      continue;
    }
    // Kargoya verildikten sonra gelen takip kodu kanala yazılır; kanal o an hata verdiyse sonraki turda yeniden (site_tracking: kanala yazılan kod)
    const cur = tn || p.tracking;
    if (ch && ch.enabled && ch.updateTracking && p.status === 'shipped' && cur && ((tn && tn !== p.tracking) || (p.site_tracking != null && p.site_tracking !== cur))) {
      try {
        await ch.updateTracking({ remote_id: p.order_remote, id: p.order_id }, { ...p, tracking: cur }, { tracking: cur, barcode: cur, cargoCompany: cn || p.cargo_company, trackingUrl: str(r.trackingUrl) || p.tracking_url });
        await run(db, 'UPDATE packages SET site_tracking = ? WHERE id = ?', cur, p.id);
        out.synced++;
      } catch (e) {
        if (p.site_tracking == null) await run(db, "UPDATE packages SET site_tracking = '' WHERE id = ? AND site_tracking IS NULL", p.id);
        await warnLog(p, `takip kodu kanala yazılamadı, sonraki turda yeniden denenecek: ${e.message}`);
      }
    }
  }
  // Teslim edilmiş ama "Kargoya ver" yapılamamış paketler (takipten çıktılar): yarım saat arayla yeniden
  for (const p of chOk ? reship : []) {
    try {
      const { autoShip } = await import('./api.js');
      await autoShip(env, db, p.order_id, p.id);
      out.shipped++;
      await run(db, 'UPDATE packages SET ship_sync = NULL WHERE id = ?', p.id);
    } catch (e) {
      await run(db, 'UPDATE packages SET carrier_checked_at = ? WHERE id = ?', t, p.id);
      await shipFail(p, e);
    }
  }
  if (auto && chOk) await syncDelivered(db, chans, out, t);
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
