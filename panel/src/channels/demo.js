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
        // Örnek müşteri telefonu: aynı ad + il aynı müşteri sayılır (tekrar eden müşteri analizini denemek için)
        const phone = `0532 ${String(100 + NAMES.indexOf(name) * 7 + CITIES.findIndex((c) => c[0] === city)).padStart(3, '0')} ${ch.length % 10}0 ${String(NAMES.indexOf(name)).padStart(2, '0')}`;
        const no = `${ch.slice(0, 2).toUpperCase()}${key.replace(/-/g, '').slice(2)}${String(i + 1).padStart(3, '0')}`;
        out.push({
          remoteId: no, orderNumber: no, orderedAt: at, remoteStatus: status, status, demo: true,
          customer: name, phone, email: '',
          address: { name, line: 'Örnek Mah. Deneme Sok. No:1 D:2', district, city, phone },
          total: lines.reduce((s, l) => s + l.total, 0), currency: 'TRY',
          cargoCompany: status === 'shipped' || status === 'delivered' ? 'Yurtiçi Kargo' : '', tracking: status === 'shipped' || status === 'delivered' ? `DEMO${no}` : '',
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
        remoteId: remoteKey(p), remoteProductId: `${ch}-${(m ? m[1] : p[2]).toLowerCase().replace(/\W+/g, '-')}`, sku: p[0], barcode: p[1], name: p[2], image: '',
        groupName: m ? m[1] : p[2], variantName: m ? m[2] : '', brand: /^HG\b/.test(p[2]) ? 'HG' : 'Hastürk',
        description: `<p><b>${p[2]}</b> — örnek ürün açıklaması. Bahçe ve saksı bitkileri için uygundur.</p><ul><li>Doğal içerik</li><li>Kolay kullanım</li></ul>`,
        category: meta.type === 'ikas' ? (/topra|torf|perlit|cocopeat|zeolit/i.test(p[2]) ? 'Toprak ve Harç' : /gübre|besin/i.test(p[2]) ? 'Gübre' : /pompa/i.test(p[2]) ? 'Bahçe Ekipmanları' : 'Tohum') : '',
        purchasePrice: p[4], price: Math.round(p[3] * (PRICE[ch] || 1)), listPrice: Math.round(p[3] * (PRICE[ch] || 1) * 1.15), stock: 20 + ((i * 7) % 30),
      };
    });
  }
  const ok = async () => ({});
  // Kargo akışı taklidi: paketle → kanal paketi, etiket → örnek barkod, kargo firması seç / değiştir
  const CARGO = ['Yurtiçi Kargo', 'Aras Kargo', 'MNG Kargo', 'Sürat Kargo', 'PTT Kargo', 'HepsiJet'];
  const pack = async (order, pkgs, { cargo } = {}) => ({ packages: pkgs.map((p) => ({ remoteId: `D${order.order_number}-${p.no}-${Date.now() % 100000}`, remoteStatus: 'READY_FOR_SHIPMENT', cargoCompany: (cargo && cargo.name) || p.cargo_company || 'Yurtiçi Kargo' })), message: 'Paket kargoya hazırlandı (örnek)' });
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
  // ikas örneği: gerçek ikas gibi gönderi "ikas Kargo ile Gönder" ile açılır; siparişi yenileyince ikas Kargo gönderisi gelmiş olur
  const isIkas = meta.type === 'ikas';
  async function fetchOne(remoteId) {
    const o = (await fetchOrders(Date.now() - 20 * 864e5, Date.now())).find((x) => x.remoteId === remoteId);
    if (!o) throw new Error('Örnek sipariş bulunamadı');
    const live = o.items.filter((i) => i.status !== 'cancelled');
    return { ...o, status: 'processing', remoteStatus: 'CREATED / READY_FOR_SHIPMENT / PAID', packages: [{ remoteId: `IK-${o.orderNumber}`, items: live.map((i) => ({ line_id: i.lineId, qty: i.quantity })), status: 'open', remoteStatus: 'READY_FOR_SHIPMENT', cargoCompany: 'hepsiJET', barcode: `7300${o.orderNumber.replace(/\D/g, '')}`, agreement: 'ikas', packed: true }] };
  }
  return {
    ...meta, enabled: true, missing: [], demo: true,
    caps: { accept: 'remote', split: 'local', pack: isIkas ? 'external' : 'remote', ...(isIkas ? { external: { label: 'ikas Kargo ile Gönder', url: 'https://demo.myikas.com/admin/order/view/' } } : {}), ship: isIkas ? 'local' : 'remote', label: 'remote', cargo: isIkas ? false : 'change', cancelPackage: true, createProduct: isIkas, price: true, ...(['trendyol', 'hepsiburada'].includes(ch) ? { answer: { min: 10, max: 2000 } } : {}) },
    fetchOrders, fetchListings, pushStock: ok, pushPrice: ok, accept: ok, ship: ok, ...(isIkas ? { fetchOne } : { pack }), label, cargoOptions, changeCargo, cancelPackage: ok,
    ...(['trendyol', 'hepsiburada'].includes(ch) ? { buybox, questions, answer, catalog } : {}),
    createProduct: async (pr) => ({ remoteId: `${ch}-${pr.sku || Date.now()}`, remoteProductId: '', sku: pr.sku, barcode: pr.barcode, name: pr.name, price: pr.sale_price, stock: pr.stock }),
  };
}
