// Deneme modu (DEMO=1): API anahtarı girmeden paneli gerçekçi örnek verilerle denemek için.
// Aynı tohum her seferinde aynı siparişleri üretir; zaman ilerledikçe yeni siparişler "gelir".
import { dayKey, DEAD_LINE } from '../util.js';

// Örnek ürünler (çok satandan aza): [stok kodu, barkod, ad, satış fiyatı, alış fiyatı, desi, görsel türü, renk, görsel etiketi, kategori]
// Görseller public/demo/<stok kodu>.svg (dev/demo-img.mjs üretir)
export const DEMO_PRODUCTS = [
  ['KB-PRO', '8690000000011', 'Kablosuz Kulaklık Pro ANC', 1299, 640, 1, 'headphones', '#1e293b', '', 'Elektronik › Kulaklık'],
  ['AF-55', '8690000000028', 'Airfryer XL 5,5 Lt', 3299, 1950, 6, 'airfryer', '#111827', '', 'Ev & Mutfak › Elektrikli Mutfak'],
  ['AS-S9', '8690000000035', 'Akıllı Saat S9 Sport', 1899, 980, 1, 'watch', '#334155', '', 'Elektronik › Giyilebilir Teknoloji'],
  ['TR-750', '8690000000042', 'Çelik Termos 750 ml', 449, 180, 1, 'bottle', '#0d9488', '', 'Ev & Mutfak › Termos ve Matara'],
  ['PF-EDP', '8690000000059', 'Kadın Parfüm EDP 100 ml', 1099, 420, 1, 'perfume', '#db2777', '', 'Kozmetik › Parfüm'],
  ['SN-RUN', '8690000000066', 'Koşu Ayakkabısı Air Run', 1799, 850, 2, 'sneaker', '#2563eb', '', 'Spor › Ayakkabı'],
  ['PB-20K', '8690000000073', 'Powerbank 20.000 mAh Hızlı Şarj', 599, 290, 1, 'powerbank', '#0f172a', '', 'Elektronik › Telefon Aksesuarı'],
  ['SR-C', '8690000000080', 'Vitamin C Serum 30 ml', 399, 120, 1, 'serum', '#f59e0b', '', 'Kozmetik › Cilt Bakımı'],
  ['KM-ESP', '8690000000097', 'Espresso Kahve Makinesi', 4499, 2700, 7, 'coffee', '#7c2d12', '', 'Ev & Mutfak › Elektrikli Mutfak'],
  ['YM-6', '8690000000103', 'Kaymaz Yoga Matı 6 mm', 399, 160, 2, 'mat', '#7c3aed', '', 'Spor › Fitness'],
  ['BT-SP', '8690000000110', 'Bluetooth Hoparlör Bass 20W', 899, 430, 1, 'speaker', '#0891b2', '', 'Elektronik › Ses Sistemleri'],
  ['SC-BAG', '8690000000127', 'Su Geçirmez Laptop Sırt Çantası', 849, 380, 2, 'backpack', '#374151', '', 'Moda › Çanta'],
  ['HG-SOL-10', '8690000000134', 'Solucan Gübresi 10 Kg', 319, 170, 3, 'bag', '#65a30d', '10 Kg', 'Bahçe › Gübre'],
  ['KL-15', '8690000000141', 'iPhone 15 Silikon Kılıf', 249, 60, 1, 'phonecase', '#e11d48', '', 'Elektronik › Telefon Aksesuarı'],
  ['DM-SET', '8690000000158', 'Ayarlanabilir Dambıl Seti 20 Kg', 2199, 1200, 8, 'dumbbell', '#dc2626', '', 'Spor › Fitness'],
  ['NV-SET', '8690000000165', 'Pamuk Saten Nevresim Takımı', 1149, 560, 3, 'bedding', '#6366f1', '', 'Ev & Mutfak › Ev Tekstili'],
  ['KT-17', '8690000000172', 'Cam Kettle 1,7 Lt', 899, 450, 2, 'kettle', '#475569', '', 'Ev & Mutfak › Elektrikli Mutfak'],
  ['GZ-POL', '8690000000189', 'Polarize Güneş Gözlüğü', 699, 250, 1, 'sunglasses', '#0f172a', '', 'Moda › Aksesuar'],
  ['SC-65W', '8690000000196', '65W GaN Hızlı Şarj Aleti', 549, 230, 1, 'charger', '#e5e7eb', '', 'Elektronik › Telefon Aksesuarı'],
  ['TK-LED', '8690000000202', 'Akıllı LED Masa Lambası', 749, 350, 2, 'lamp', '#0ea5e9', '', 'Ev & Mutfak › Aydınlatma'],
  ['GK-SPF', '8690000000219', 'Güneş Kremi SPF 50+', 349, 130, 1, 'tube', '#f97316', '', 'Kozmetik › Güneş Koruma'],
  ['HG-SAKSI-20', '8690000000226', 'Organik Saksı Toprağı 20 Lt', 169, 80, 2, 'bag', '#92400e', '20 Lt', 'Bahçe › Toprak'],
  ['DS-SET', '8690000000233', 'Damla Sulama Seti 25 Mt', 299, 140, 2, 'hose', '#16a34a', '', 'Bahçe › Sulama'],
  ['BM-PRO', '8690000000240', 'Profesyonel Budama Makası', 249, 115, 1, 'shears', '#ea580c', '', 'Bahçe › El Aletleri'],
];
// Demo kanalları (en çok kullanılan pazaryerleri + tek site) ve günlük sipariş yoğunluğu
export const DEMO_CHANNELS = ['ikas1', 'trendyol', 'hepsiburada', 'amazon', 'n11', 'ciceksepeti', 'pttavm', 'idefix', 'pazarama', 'koctas'];
const WEIGHT = { ikas1: 3.2, trendyol: 6, hepsiburada: 4, amazon: 2.6, n11: 2.2, ciceksepeti: 1.8, pttavm: 1.5, idefix: 1.4, pazarama: 1.2, koctas: 1 };
const NAMES = ['Ayşe Yılmaz', 'Mehmet Kaya', 'Zeynep Demir', 'Ali Çelik', 'Elif Şahin', 'Mustafa Arslan', 'Fatma Doğan', 'Emre Koç', 'Hatice Kurt', 'Burak Öztürk', 'Selin Aydın', 'Can Polat', 'Deniz Aksoy', 'Gizem Yıldız', 'Oğuz Kılıç', 'Merve Çetin', 'Kerem Aslan', 'Ebru Tekin', 'Serkan Güneş', 'Buse Erdem'];
const CITIES = [['İstanbul', 'Kadıköy'], ['İstanbul', 'Beşiktaş'], ['İstanbul', 'Ataşehir'], ['Ankara', 'Çankaya'], ['İzmir', 'Bornova'], ['Bursa', 'Nilüfer'], ['Antalya', 'Muratpaşa'], ['Konya', 'Selçuklu'], ['Kocaeli', 'İzmit'], ['Adana', 'Seyhan'], ['Gaziantep', 'Şahinbey'], ['Eskişehir', 'Tepebaşı']];

function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const PRICE = { ikas1: 1, trendyol: 1.06, hepsiburada: 1.05, amazon: 1.08, n11: 1.04, ciceksepeti: 1.07, pttavm: 1.03, idefix: 1.05, pazarama: 1.03, koctas: 1.06 };
const BRAND = { Elektronik: 'Volta', 'Ev & Mutfak': 'Casa', Kozmetik: 'Lumière', Spor: 'Atlas', Moda: 'Urban', Bahçe: 'HG' };
const STREETS = ['Atatürk Cad.', 'Cumhuriyet Mah. Gül Sok.', 'İstiklal Cad.', 'Bağdat Cad.', 'Fevzi Çakmak Mah. Lale Sok.', 'Yıldız Mah. Çınar Sok.', 'Barbaros Bulv.', 'Kazım Karabekir Cad.'];
const CARRIER = { trendyol: 'Trendyol Express', hepsiburada: 'HepsiJet', amazon: 'Yurtiçi Kargo', n11: 'Aras Kargo', ciceksepeti: 'Aras Kargo', pttavm: 'PTT Kargo', idefix: 'Sürat Kargo', pazarama: 'Yurtiçi Kargo', koctas: 'Yurtiçi Kargo', ikas1: 'HepsiJet' };
export function demo(meta) {
  const ch = meta.id;
  const remoteKey = (p) => (ch === 'trendyol' || ch === 'pttavm' ? p[1] : `${ch}-${p[0]}`);

  async function fetchOrders(since, until) {
    const out = [];
    const D = 864e5, start = Date.parse(dayKey(since)), w = WEIGHT[ch] || 1;
    for (let d = start; d <= until; d += D) {
      const key = dayKey(d), r = rng(ch + key);
      // Hafta sonu ve bahar ayları daha yoğun
      const dt = new Date(d), month = dt.getUTCMonth(), wd = dt.getUTCDay();
      const season = [0.6, 0.7, 1.2, 1.6, 1.5, 1.1, 0.9, 0.8, 1.0, 1.1, 0.8, 0.6][month];
      const n = Math.round(w * season * (wd === 0 || wd === 6 ? 1.3 : 1) * (0.5 + r() * 1.2));
      // Bugün: günün tamamının siparişi şu ana kadar geçen sürede gelmiş gibi dağıtılır (panel her saatte dolu ve canlı görünür)
      const today = until - d < D, span = today ? Math.max(3600e3, until - (d - 3 * 3600e3)) : D;
      for (let i = 0; i < n; i++) {
        const at = d + Math.floor(r() * span) - 3 * 3600e3;
        if (at > until || at < since) continue;
        const age = (until - at) / D;
        const lines = [], count = r() < 0.7 ? 1 : r() < 0.7 ? 2 : 3;
        for (let j = 0; j < count; j++) {
          const p = DEMO_PRODUCTS[Math.floor(Math.pow(r(), 1.6) * DEMO_PRODUCTS.length)];
          if (lines.some((l) => l.sku === p[0])) continue;
          const q = r() < 0.8 ? 1 : 2, unit = Math.round(p[3] * (PRICE[ch] || 1));
          lines.push({ lineId: `${key}-${i}-${j}`, sku: p[0], barcode: p[1], name: p[2], image: `/demo/${p[0]}.svg`, quantity: q, unitPrice: unit, total: unit * q, status: '', remoteKey: remoteKey(p) });
        }
        const x = r();
        let status = age < 0.3 ? 'new' : age < 1.2 ? 'processing' : age < 4 ? 'shipped' : 'delivered';
        if (x < 0.04) status = 'cancelled'; else if (x < 0.06 && age > 6) status = 'returned';
        if (status === 'cancelled') lines.forEach((l) => (l.status = 'cancelled'));
        const [city, district] = CITIES[Math.floor(r() * CITIES.length)], name = NAMES[Math.floor(r() * NAMES.length)];
        // Örnek müşteri telefonu: aynı ad + il aynı müşteri sayılır (tekrar eden müşteri analizini denemek için)
        const phone = `0532 ${String(100 + NAMES.indexOf(name) * 7 + CITIES.findIndex((c) => c[0] === city)).padStart(3, '0')} ${ch.length % 10}0 ${String(NAMES.indexOf(name)).padStart(2, '0')}`;
        const no = `${ch.slice(0, 2).toUpperCase()}${key.replace(/-/g, '').slice(2)}${String(i + 1).padStart(3, '0')}`;
        out.push({
          remoteId: no, orderNumber: no, orderedAt: at, remoteStatus: status, status, demo: true,
          customer: name, phone, email: '',
          address: { name, line: `${STREETS[Math.floor(r() * STREETS.length)]} No:${1 + Math.floor(r() * 80)} D:${1 + Math.floor(r() * 12)}`, district, city, phone },
          total: lines.reduce((s, l) => s + l.total, 0), currency: 'TRY',
          cargoCompany: status === 'shipped' || status === 'delivered' ? CARRIER[ch] || 'Yurtiçi Kargo' : '', tracking: status === 'shipped' || status === 'delivered' ? `DEMO${no}` : '',
          shipBy: ['new', 'processing'].includes(status) ? at + (ch === 'trendyol' ? 1 : 2) * D : null,
          items: lines, packages: null,
          ...(meta.type === 'ikas' ? { cargoChoice: r() < 0.6 ? 'HepsiJet Ücretsiz Kargo' : 'Aras Kargo (Ücretli)' } : {}),
        });
      }
    }
    return out;
  }

  async function fetchListings() {
    // Ürün yükle ekranını denemek için son iki ürün pazaryerlerinde henüz yok
    return DEMO_PRODUCTS.filter((p, i) => meta.type === 'ikas' || i < DEMO_PRODUCTS.length - 2).map((p, i) => {
      // Örnek varyant: adın sonundaki ölçü (5 Kg, 20 Lt…) varyant, öncesi ana ürün
      const m = /^(.*?)\s+(\d+(?:[.,]\d+)?\s*(?:Kg|Lt|gr|ml))$/i.exec(p[2]);
      return {
        remoteId: remoteKey(p), remoteProductId: `${ch}-${(m ? m[1] : p[2]).toLowerCase().replace(/\W+/g, '-')}`, sku: p[0], barcode: p[1], name: p[2], image: `/demo/${p[0]}.svg`, images: [`/demo/${p[0]}.svg`],
        groupName: m ? m[1] : p[2], variantName: m ? m[2] : '', brand: BRAND[p[9].split(' › ')[0]] || 'Demo',
        description: `<p><b>${p[2]}</b> — ${p[9].split(' › ').pop()} kategorisinin en çok satan ürünlerinden.</p><ul><li>Aynı gün kargo</li><li>2 yıl garanti</li><li>Kolay iade</li></ul>`,
        category: meta.type === 'ikas' ? p[9] : '',
        purchasePrice: p[4], price: Math.round(p[3] * (PRICE[ch] || 1)), listPrice: Math.round(p[3] * (PRICE[ch] || 1) * 1.15), stock: 140 + ((i * 37) % 260),
      };
    });
  }
  const ok = async () => ({});
  // Kargo akışı taklidi: paketle → kanal paketi, etiket → örnek barkod, kargo firması seç / değiştir
  const CARGO = ['Yurtiçi Kargo', 'Aras Kargo', 'DHL eCommerce', 'Sürat Kargo', 'PTT Kargo', 'HepsiJet'];
  const pack = async (order, pkgs, { cargo } = {}) => ({ packages: pkgs.map((p) => ({ remoteId: `D${order.order_number}-${p.no}-${Date.now() % 100000}`, remoteStatus: 'READY_FOR_SHIPMENT', cargoCompany: (cargo && cargo.name) || p.cargo_company || 'Yurtiçi Kargo' })), message: 'Paket kargoya hazırlandı' });
  const label = async (order, pkg) => (meta.type === 'ikas' && !pkg.remote_id
    ? { pending: 'Bu sipariş henüz ikas Kargo ile gönderilmedi. “ikas Kargo ile Gönder”e basın (örnek).', external: true, step: 'external' }
    : { barcode: `DEMO${order.order_number}${pkg.no}`.replace(/[^A-Z0-9]/gi, ''), cargoCompany: pkg.cargo_company || 'Yurtiçi Kargo', panel: true, agreement: /^ikas/.test(ch) ? 'ikas' : ch });
  const cargoOptions = async () => CARGO.map((n, i) => ({ id: 'C' + i, name: n }));
  const changeCargo = async (order, pkg, cargo) => ({ remoteId: pkg.remote_id, cargoCompany: cargo.name, resetLabel: true });
  // Örnek buybox: sıra ve rakip fiyatları (saatlik değişir)
  const buybox = async (ids) => ids.map((id) => {
    const p = DEMO_PRODUCTS.find((x) => remoteKey(x) === id);
    if (!p) return { remoteId: id, rank: null };
    const r = rng(id + Math.floor(Date.now() / 3600e3)), price = Math.round(p[3] * (PRICE[ch] || 1));
    const rank = r() < 0.45 ? 1 : r() < 0.7 ? 2 : 3, rival = Math.round(price * (0.93 + r() * 0.12));
    return { remoteId: id, rank, buyboxPrice: rank === 1 ? price : rival, second: rank === 1 ? Math.round(price * (1 + r() * 0.08)) : price, third: Math.round(price * 1.1), multi: r() < 0.85 };
  });
  // Örnek müşteri soruları (Trendyol / Hepsiburada)
  const Q = ['Bu ürün saksı bitkileri için uygun mu?', 'Kaç günde kargoya verilir?', 'Son kullanma tarihi nedir?', 'Organik tarıma uygun sertifikası var mı?', '10 kg seçeneği olacak mı?', 'Orkide için kullanılabilir mi?'];
  const answered = new Map();
  async function questions({ since }) {
    const items = [];
    for (let i = 0; i < 6; i++) {
      const r = rng(ch + 'q' + i), p = DEMO_PRODUCTS[Math.floor(r() * DEMO_PRODUCTS.length)], id = `${ch}-q${i}`;
      const at = Date.now() - (i * 7 + 2) * 3600e3, ans = answered.get(id) || (i > 3 ? 'Merhaba, evet uygundur. İyi günler dileriz.' : null);
      if (at < since) continue;
      items.push({ remoteId: id, text: Q[i], askedAt: at, status: ans ? 'answered' : 'waiting', remoteStatus: ans ? 'ANSWERED' : 'WAITING_FOR_ANSWER', productName: p[2], barcode: p[1], sku: p[0], customer: NAMES[i].split(' ')[0] + ' ' + NAMES[i].split(' ')[1][0] + '.', answer: ans, answeredAt: ans ? at + 3600e3 : null, dueAt: at + 48 * 3600e3 });
    }
    return { items, hasNext: false, total: items.length };
  }
  const answer = async (q, text) => { answered.set(q.remote_id, text); };
  // Örnek katalog (Ürün yükle ekranını denemek için): birkaç kategori, zorunlu özellik ve değer listesi
  const CATS = [['501', 'Organik Gübre', 'Bahçe › Gübre'], ['502', 'Saksı Toprağı', 'Bahçe › Toprak'], ['503', 'İlaçlama Pompası', 'Bahçe › Ekipman'], ['504', 'Sebze Tohumu', 'Bahçe › Tohum']];
  const ATTRS = [{ id: '10', name: 'Ağırlık / Hacim', mandatory: true, kind: 'variant', type: 'enum', custom: true }, { id: '11', name: 'Menşei', mandatory: true, kind: 'category', type: 'enum' }, { id: '12', name: 'Kullanım Alanı', mandatory: false, kind: 'category', type: 'text', custom: true }];
  const VALS = { 10: ['1 Lt', '3 Lt', '5 Kg', '10 Kg', '10 Lt', '20 Lt', '2 Lt', '16 Lt'], 11: ['TR', 'CN', 'DE'] };
  const uploads = new Map();
  const catalog = {
    categories: async (q) => { const k = String(q || '').toLocaleLowerCase('tr'); const items = CATS.map(([id, name, path]) => ({ id, name, path })).filter((c) => !k || `${c.name} ${c.path}`.toLocaleLowerCase('tr').includes(k)); return { total: CATS.length, items }; },
    allCategories: async () => CATS.map(([id, name, path]) => ({ id, name, path })),
    attributes: async () => ATTRS,
    values: async (c, a) => (VALS[a] || []).map((v, i) => ({ id: String(a * 100 + i), value: v })),
    async build(pr, map, { pick }) {
      const missing = [];
      for (const a of ATTRS) {
        const v = (map.attrs || {})[a.id]; let val = v && v.value;
        if (val === '@variant') { const hit = await pick(a, pr.variant); val = hit ? hit.value : pr.variant; }
        if (!val && a.mandatory) missing.push(a.name);
      }
      if (!pr.barcode) missing.push('barkod'); if (!(pr.price > 0)) missing.push('fiyat');
      return { key: pr.barcode || pr.sku, missing, payload: { barcode: pr.barcode, title: pr.name, price: pr.price, stock: pr.stock } };
    },
    async send(items) { const ref = 'DEMO-' + Date.now().toString(36); uploads.set(ref, items.map((x) => x.barcode)); return { ref }; },
    async status(ref) { return { done: true, items: (uploads.get(ref) || []).map((k) => ({ key: k, status: 'SUCCESS', ok: true, error: '' })) }; },
    options: ch === 'trendyol' ? [{ k: 'cargoCompanyId', label: 'Kargo firması ID (isteğe bağlı)' }] : [{ k: 'warranty', label: 'Garanti süresi (ay)' }],
  };
  // Örnek iade talepleri (Trendyol / Hepsiburada örneği): son teslim edilen siparişlerden birkaçı
  const decided = new Map();
  // Örnek iade fotoğrafları (müşterinin eklediği; gerçek kanalda talep verisinden gelir)
  const svg = (bg, t) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="${bg}"/><rect x="50" y="70" width="140" height="110" rx="6" fill="#c8a06a" stroke="#8a6a3a" stroke-width="4"/><path d="M50 70 L95 105 L120 80 L150 112 L190 70" fill="none" stroke="#6b4c22" stroke-width="5"/><text x="120" y="215" font-family="Arial" font-size="18" text-anchor="middle" fill="#333">${t}</text></svg>`);
  const DEMO_CLAIM_IMAGES = [svg('#eef2f7', 'Ezik kutu'), svg('#f7efe9', 'Akmış şişe')];
  async function claims({ since, until = Date.now(), page = 0 }) {
    if (page) return { items: [], hasNext: false };
    const orders = (await fetchOrders(since, until)).filter((o) => o.status === 'delivered').slice(0, 4);
    const WHY = ['Beğenmedim', 'Hasarlı ürün geldi', 'Yanlış ürün gönderildi', 'Vazgeçtim'];
    return { hasNext: false, items: orders.map((o, i) => {
      const id = `CLM-${o.orderNumber}`, st = decided.get(id) || (i === 3 ? 'accepted' : 'waiting');
      const lines = o.items.slice(0, 1).map((it) => ({ id: `${id}-1`, ids: [`${id}-1`], name: it.name, barcode: it.barcode, sku: it.sku, qty: it.quantity, price: it.unitPrice, reason: WHY[i], note: i === 1 ? 'Kutu ezik geldi, içindeki şişe akmış.' : '', status: st, remoteStatus: st === 'waiting' ? 'Aksiyon bekliyor' : st === 'accepted' ? 'Onaylandı' : 'Reddedildi' }));
      return { remoteId: id, orderNumber: o.orderNumber, claimedAt: o.orderedAt + 3 * 864e5, status: st, remoteStatus: lines[0] ? lines[0].remoteStatus : '', customer: o.customer, reason: WHY[i], note: lines[0] && lines[0].note, lines, amount: lines.reduce((x, l) => x + l.price * l.qty, 0), cargo: 'Aras Kargo', tracking: `5${o.orderNumber.replace(/\D/g, '')}`, images: i === 1 ? DEMO_CLAIM_IMAGES : [] };
    }) };
  }
  const claimReasons = async () => [{ id: '1', name: 'Ürün kullanılmış' }, { id: '2', name: 'Ürün hasarlı (müşteri kaynaklı)' }, { id: '3', name: 'Farklı ürün gönderilmiş' }, { id: '4', name: 'Eksik parça' }];
  const approveClaim = async (c) => { decided.set(c.remote_id, 'accepted'); };
  const rejectClaim = async (c) => { decided.set(c.remote_id, 'rejected'); };
  // Örnek Hepsiburada sepet indirimleri
  const camps = [{ campaignId: 9001, name: '500 TL üzeri %10', description: 'Bahçe ürünlerinde', startDate: new Date(Date.now() - 5 * 864e5).toISOString(), endDate: new Date(Date.now() + 10 * 864e5).toISOString(), status: 1, limit: 100 }];
  const campaigns = {
    list: async () => ({ total: camps.length, items: camps }),
    detail: async (id) => ({ ...camps.find((c) => String(c.campaignId) === String(id)), type: 'percent', conditionAmount: 500, discountAmount: 10, remainingUsageCount: 64 }),
    budgets: async () => [1000, 2500, 5000],
    limits: async () => ({ rowCount: 2, limits: [{ lowerLimit: 250, campaignAmounts: [25, 50] }, { lowerLimit: 500, campaignAmounts: [50, 75, 100] }] }),
    categories: async () => [{ categoryId: 60001, categoryName: 'Gübreler', isLeaf: true, isCampaign: true }, { categoryId: 60002, categoryName: 'Bitki Toprakları', isLeaf: true, isCampaign: true }],
    create: async (kind, b) => { const id = 9000 + camps.length + 1; camps.push({ campaignId: id, name: b.name, description: b.description, startDate: b.startDate, endDate: b.endDate, status: 1, limit: b.maxCartCount || 0 }); return { campaignId: id }; },
    cancel: async (id) => { const c = camps.find((x) => String(x.campaignId) === String(id)); if (c) c.status = 3; },
  };
  // ikas örneği: gerçek ikas gibi gönderi "ikas Kargo ile Gönder" ile açılır; siparişi yenileyince ikas Kargo gönderisi gelmiş olur
  const isIkas = meta.type === 'ikas';
  async function fetchOne(remoteId) {
    const o = (await fetchOrders(Date.now() - 20 * 864e5, Date.now())).find((x) => x.remoteId === remoteId);
    if (!o) throw new Error('Örnek sipariş bulunamadı');
    const live = o.items.filter((i) => !DEAD_LINE(i.status));
    return { ...o, status: 'processing', remoteStatus: 'CREATED / READY_FOR_SHIPMENT / PAID', packages: [{ remoteId: `IK-${o.orderNumber}`, items: live.map((i) => ({ line_id: i.lineId, qty: i.quantity })), status: 'open', remoteStatus: 'READY_FOR_SHIPMENT', cargoCompany: 'hepsiJET', barcode: `7300${o.orderNumber.replace(/\D/g, '')}`, agreement: 'ikas', packed: true }] };
  }
  return {
    ...meta, enabled: true, missing: [], demo: true,
    caps: { accept: 'remote', split: 'local', pack: isIkas ? 'external' : 'remote', ...(isIkas ? { external: { label: 'ikas Kargo ile Gönder', url: 'https://demo.myikas.com/admin/order/view/' } } : {}), ship: isIkas ? 'local' : 'remote', label: 'remote', cargo: isIkas ? false : 'change', cancelPackage: true, createProduct: ['ikas', 'woocommerce', 'shopify'].includes(meta.type), price: true, ...(['trendyol', 'hepsiburada'].includes(ch) ? { answer: { min: 10, max: 2000 } } : {}) },
    fetchOrders, fetchListings, pushStock: ok, pushPrice: ok, accept: ok, ship: ok, ...(isIkas ? { fetchOne } : { pack }), label, cargoOptions, changeCargo, cancelPackage: ok,
    ...(['trendyol', 'hepsiburada'].includes(ch) ? { buybox, questions, answer, catalog, claims, claimReasons, approveClaim, rejectClaim, ...(ch === 'hepsiburada' ? { campaigns } : {}) } : {}),
    createProduct: async (pr) => ({ remoteId: `${ch}-${pr.sku || Date.now()}`, remoteProductId: '', sku: pr.sku, barcode: pr.barcode, name: pr.name, price: pr.sale_price, stock: pr.stock }),
  };
}
