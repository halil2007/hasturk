// Deneme modu (DEMO=1): API anahtarı girmeden paneli gerçekçi örnek verilerle denemek için.
// Aynı tohum her seferinde aynı siparişleri üretir; zaman ilerledikçe yeni siparişler "gelir".
import { dayKey } from '../util.js';

export const DEMO_PRODUCTS = [
  ['HG-SOL-5', '8690000000011', 'HG Solucan Gübresi 5 Kg', 189, 95, 1.5],
  ['HG-SOL-10', '8690000000028', 'HG Solucan Gübresi 10 Kg', 319, 170, 3],
  ['HG-TORF-20', '8690000000035', 'HG Torf 20 Lt', 149, 72, 2],
  ['HG-PERLIT-10', '8690000000042', 'HG Perlit 10 Lt', 129, 55, 2],
  ['HG-COCO-5', '8690000000059', 'HG Cocopeat Blok 5 Kg', 239, 120, 2],
  ['HG-SAKSI-20', '8690000000066', 'HG Saksı Toprağı 20 Lt', 169, 80, 2],
  ['HG-ORKIDE-3', '8690000000073', 'HG Orkide Toprağı 3 Lt', 99, 38, 1],
  ['HG-KAKTUS-5', '8690000000080', 'HG Kaktüs Toprağı 5 Lt', 109, 45, 1],
  ['HG-POMPA-2', '8690000000097', 'Basınçlı İlaçlama Pompası 2 Lt', 279, 150, 2],
  ['HG-POMPA-16', '8690000000103', 'Sırt Tipi İlaçlama Pompası 16 Lt', 1149, 690, 6],
  ['HG-DOMATES-T', '8690000000110', 'Domates Tohumu (Paket)', 49, 14, 1],
  ['HG-SIVI-1', '8690000000127', 'Sıvı Bitki Besini 1 Lt', 159, 62, 1],
  ['HG-MONSTERA', '8690000000134', 'HG Monstera Toprağı 10 Lt', 189, 84, 2],
  ['HG-ZEOLIT-5', '8690000000141', 'Zeolit 5 Kg', 139, 58, 2],
];
const WEIGHT = { ikas1: 2.2, ikas2: 0.9, trendyol: 3.1, hepsiburada: 1.6, pttavm: 0.6 };
const NAMES = ['Ayşe Yılmaz', 'Mehmet Kaya', 'Zeynep Demir', 'Ali Çelik', 'Elif Şahin', 'Mustafa Arslan', 'Fatma Doğan', 'Emre Koç', 'Hatice Kurt', 'Burak Öztürk', 'Selin Aydın', 'Can Polat'];
const CITIES = [['İstanbul', 'Kadıköy'], ['Ankara', 'Çankaya'], ['İzmir', 'Bornova'], ['Bursa', 'Nilüfer'], ['Antalya', 'Muratpaşa'], ['Konya', 'Selçuklu'], ['Kocaeli', 'İzmit']];

function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const PRICE = { ikas1: 1, ikas2: 1, trendyol: 1.12, hepsiburada: 1.1, pttavm: 1.05 };
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
      for (let i = 0; i < n; i++) {
        const at = d + Math.floor(r() * D) - 3 * 3600e3;
        if (at > until || at < since) continue;
        const age = (until - at) / D;
        const lines = [], count = r() < 0.7 ? 1 : r() < 0.7 ? 2 : 3;
        for (let j = 0; j < count; j++) {
          const p = DEMO_PRODUCTS[Math.floor(Math.pow(r(), 1.6) * DEMO_PRODUCTS.length)];
          if (lines.some((l) => l.sku === p[0])) continue;
          const q = r() < 0.8 ? 1 : 2, unit = Math.round(p[3] * (PRICE[ch] || 1));
          lines.push({ lineId: `${key}-${i}-${j}`, sku: p[0], barcode: p[1], name: p[2], image: '', quantity: q, unitPrice: unit, total: unit * q, status: '', remoteKey: remoteKey(p) });
        }
        const x = r();
        let status = age < 0.5 ? 'new' : age < 1.5 ? 'processing' : age < 4 ? 'shipped' : 'delivered';
        if (x < 0.04) status = 'cancelled'; else if (x < 0.06 && age > 6) status = 'returned';
        if (status === 'cancelled') lines.forEach((l) => (l.status = 'cancelled'));
        const [city, district] = CITIES[Math.floor(r() * CITIES.length)], name = NAMES[Math.floor(r() * NAMES.length)];
        const no = `${ch.slice(0, 2).toUpperCase()}${key.replace(/-/g, '').slice(2)}${String(i + 1).padStart(3, '0')}`;
        out.push({
          remoteId: no, orderNumber: no, orderedAt: at, remoteStatus: status, status, demo: true,
          customer: name, phone: '0555 000 00 00', email: '',
          address: { name, line: 'Örnek Mah. Deneme Sok. No:1 D:2', district, city, phone: '0555 000 00 00' },
          total: lines.reduce((s, l) => s + l.total, 0), currency: 'TRY',
          cargoCompany: status === 'shipped' || status === 'delivered' ? 'Yurtiçi Kargo' : '', tracking: status === 'shipped' || status === 'delivered' ? `DEMO${no}` : '',
          items: lines, packages: null,
        });
      }
    }
    return out;
  }

  async function fetchListings() {
    return DEMO_PRODUCTS.map((p, i) => ({
      remoteId: remoteKey(p), remoteProductId: remoteKey(p), sku: p[0], barcode: p[1], name: p[2], image: '',
      purchasePrice: p[4], price: Math.round(p[3] * (PRICE[ch] || 1)), listPrice: Math.round(p[3] * (PRICE[ch] || 1) * 1.15), stock: 20 + ((i * 7) % 30),
    }));
  }
  const ok = async () => ({});
  return {
    ...meta, enabled: true, missing: [], demo: true,
    caps: { accept: 'remote', split: 'local', ship: 'remote', label: null, createProduct: meta.type === 'ikas', price: true },
    fetchOrders, fetchListings, pushStock: ok, pushPrice: ok, accept: ok, ship: ok,
    createProduct: async (pr) => ({ remoteId: `${ch}-${pr.sku || Date.now()}`, remoteProductId: '', sku: pr.sku, barcode: pr.barcode, name: pr.name, price: pr.sale_price, stock: pr.stock }),
  };
}
