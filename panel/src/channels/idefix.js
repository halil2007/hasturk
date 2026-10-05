// idefix pazaryeri (merchantapi.idefix.com, developer.idefix.com dokümanına göre). Satıcı paneli → Hesap Bilgilerim → Entegrasyon Bilgileri →
// “Yeni API Oluştur”: API KEY ve API SECRET KEY satıcının e-posta adresine gönderilir; Satıcı ID ekranda görünür.
// Kimlik: X-API-KEY = base64(ApiKey:ApiSecret). Canlı ortamda IP izni gerekmez (test ortamında gerekir).
// Kimlik: X-API-KEY başlığı (biçim otomatik bulunur, aşağıya bakın). Siparişler: /oms/{vendorId}/list · Ürün/stok/fiyat: /pim/...
// Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür.
import { http, num, str, chunk, diagStep, sleep, imageList } from '../util.js';

const BASE = 'https://merchantapi.idefix.com';
// idefix durumları "shipment_" önekiyle gelir (shipment_created, shipment_picking, shipment_in_cargo, shipment_delivered…)
const STATUS = {
  // Dokümana göre: created (ödeme alındı) → ready (hazırlanabilir) → picking (iptal edilemez) → invoiced → in_cargo → delivered → approved (hak ediş)
  created: 'new', ready: 'new', awaiting: 'new', split: 'new',
  picking: 'processing', ready_to_ship: 'processing', invoiced: 'processing', approved: 'delivered',
  in_cargo: 'shipped', shipped: 'shipped', undeliver: 'shipped', undelivered: 'shipped', at_collection_point: 'shipped',
  delivered: 'delivered', cancelled: 'cancelled', canceled: 'cancelled', unsupplied: 'cancelled', un_supplied: 'cancelled', returned: 'returned', refunded: 'returned',
};
export const idefixStatus = (s) => STATUS[String(s || '').trim().toLowerCase().replace(/-/g, '_').replace(/^shipment_/, '')] || 'new';

export function idefix(env, meta) {
  const key = str(env.IDEFIX_API_KEY), secret = str(env.IDEFIX_API_SECRET), vendor = str(env.IDEFIX_VENDOR_ID);
  // Kimlik: satıcı panelinde (Hesabım → Entegrasyon Bilgileri) yeni hesaplarda yalnızca Satıcı ID + API KEY verilir; eski hesaplarda
  // ayrıca API Secret vardır. X-API-KEY biçimi buna göre denenir ve kabul edilen biçim hatırlanır (401/403 alınca sıradakine geçilir).
  const b64 = (t) => btoa(unescape(encodeURIComponent(t)));
  // API KEY alanına zaten "anahtar:gizli" ya da onun base64 hali yapıştırılmış olabilir
  const pairB64 = (() => { try { return /^[A-Za-z0-9+/]+=*$/.test(key) && key.length >= 16 && atob(key).includes(':'); } catch { return false; } })();
  const MODES = [];
  // Her biçim: [ad, X-API-KEY değeri, ek başlıklar]
  const addMode = (name, v, extra = null) => { if (v && !MODES.some((m) => m[1] === v && JSON.stringify(m[2]) === JSON.stringify(extra))) MODES.push([name, v, extra]); };
  if (secret) addMode('API KEY:API Secret (base64)', b64(`${key}:${secret}`));
  if (key.includes(':')) addMode('API KEY alanındaki anahtar:gizli (base64)', b64(key));
  if (pairB64) addMode('API KEY olduğu gibi (hazır base64)', key);
  addMode('yalnız API KEY', key);
  addMode('API KEY (base64)', b64(`${key}:`));
  addMode('Satıcı ID:API KEY (base64)', b64(`${vendor}:${key}`));
  // Bazı pazaryerleri kimliği Authorization başlığında ister
  if (secret) addMode('Authorization: Basic API KEY:API Secret', b64(`${key}:${secret}`), { Authorization: 'Basic ' + b64(`${key}:${secret}`) });
  addMode('Authorization: Bearer API KEY', key, { Authorization: 'Bearer ' + key });
  let mode = 0, modeOk = false;
  const tried = [];
  const headers = () => ({ 'X-API-KEY': MODES[mode][1], 'Content-Type': 'application/json', Accept: 'application/json', ...(MODES[mode][2] || {}) });
  // idefix istek sınırı sıkı: 429 / 5xx'te artan beklemeyle 4 deneme (bağlantı test edilip sonra senkronda kopması bu yüzdendi)
  async function call(path, opts = {}) {
    for (;;) {
      try {
        const r = await http(BASE + path, { tries: 4, timeout: 30000, ...opts, headers: headers(), body: opts.body && JSON.stringify(opts.body) });
        modeOk = true;
        return r;
      } catch (e) {
        if (!/HTTP (401|403)/.test(e.message)) throw e;
        if (!modeOk) {
          tried.push(`${MODES[mode][0]} → ${(/HTTP \d{3}\s*(.*)$/.exec(e.message) || [])[1] || e.message}`.slice(0, 160));
          if (mode < MODES.length - 1) { mode++; continue; }
        }
        const fmt = /NOT_FORMAT/i.test(tried.join(' ') + e.message);
        throw new Error(`HTTP ${(/HTTP (\d{3})/.exec(e.message) || [])[1]} — idefix kimliği reddetti. Denenen biçimler: ${tried.join(' · ')}. `
          + (fmt ? 'idefix “VENDOR_TOKEN_NOT_FORMATED” diyor: anahtarı “API KEY:API Secret” çiftinden oluşmuş biçimde bekliyor. '
            + (secret ? 'Panelde kayıtlı API Secret bu API KEY\'e ait değil (eski olabilir): doğru API Secret\'ı girin ya da “Panelde kayıtlı değeri sil” ile silin.'
              : 'idefix → Hesap Bilgilerim → Entegrasyon Bilgileri → “Yeni API Oluştur” dediğinizde API KEY ve API SECRET KEY idefix\'te kayıtlı e-posta adresinize gönderilir; ikisini de girin.')
            : 'Satıcı ID ve API KEY\'i idefix → Hesabım → Entegrasyon Bilgileri\'nden yeniden kopyalayın.'));
      }
    }
  }
  // Sayfalı okuma: sayfa boyutu reddedilirse (400/422) 50'ye, sonra 20'ye düşülür; sayfalar arasında kısa bekleme
  let pageSize = 100;
  async function paged(build, maxPages) {
    const out = [];
    for (let page = 1; page <= maxPages; page++) {
      let rows;
      for (;;) {
        try { rows = list(await call(build(page, pageSize))); break; }
        catch (e) { if (/HTTP (400|422)/.test(e.message) && pageSize > 20) { pageSize = pageSize === 100 ? 50 : 20; continue; } throw e; }
      }
      out.push(...rows);
      if (rows.length < pageSize) break;
      await sleep(250);
    }
    return out;
  }
  const list = (r) => (Array.isArray(r) ? r : (r && (r.items || r.data || r.content || r.products)) || []);
  // Tarih biçimi: yyyy/MM/dd HH:mm:ss (Türkiye saati)
  const fmt = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 19).replace('T', ' ').replace(/-/g, '/');

  function norm(s) {
    const a = s.shippingAddress || {}, st = idefixStatus(s.status);
    const items = (s.items || []).map((it) => {
      const qty = num(it.quantity, 1), total = num(it.discountedTotalPrice) || num(it.price ?? it.productPrice) * qty;
      return { lineId: str(it.id || it.orderLineId), sku: str(it.merchantSku || it.erpId), barcode: str(it.barcode), name: str(it.productName || it.title), image: str(it.image || it.productImage).replace('{size}', '300/'), quantity: qty, variantName: (it.productAttributes || []).map((a) => a.attributeValueName).filter(Boolean).join(' / '), unitPrice: qty ? total / qty : total, total,
        status: st === 'cancelled' ? 'cancelled' : '', remoteKey: str(it.barcode), commission: it.commissionAmount != null ? num(it.commissionAmount) : null };
    });
    return {
      remoteId: str(s.id), orderNumber: str(s.orderNumber || s.id), orderedAt: Date.parse(s.orderDate || s.createdAt) || Date.now(), remoteStatus: str(s.status), status: st,
      customer: str(s.customerContactName || a.fullName), phone: str(a.phone), email: str(s.customerContactMail || s.customerEmail), customerId: str(s.customerId),
      address: { name: str(a.fullName || [a.firstName, a.lastName].filter(Boolean).join(' ')), line: str(a.address1 || a.address), district: str(a.county || a.district), city: str(a.city), phone: str(a.phone) },
      total: items.reduce((x, i) => x + (i.status ? 0 : i.total), 0), currency: 'TRY',
      cargoCompany: str(s.cargoCompany || s.cargoProfileName), tracking: str(s.cargoTrackingNumber || s.cargoKey), trackingUrl: str(s.cargoTrackingUrl || s.trackingUrl),
      shipBy: Date.parse(s.lastShipmentDate || s.estimatedDeliveryDate || '') || null, items,
      packages: [{ remoteId: str(s.id), items: items.map((i) => ({ line_id: i.lineId, qty: i.quantity })), status: ['shipped', 'delivered'].includes(st) ? 'shipped' : 'open', remoteStatus: str(s.status), cargoCompany: str(s.cargoCompany), tracking: str(s.cargoTrackingNumber || s.cargoKey), trackingUrl: str(s.cargoTrackingUrl || s.trackingUrl), packed: st !== 'new' }],
    };
  }

  async function fetchOrders(since, until) {
    const rows = await paged((page, n) => `/oms/${vendor}/list?page=${page}&limit=${n}&startDate=${encodeURIComponent(fmt(since))}&endDate=${encodeURIComponent(fmt(until))}&sortByField=createAt&sortDirection=desc`, 100);
    return rows.map(norm);
  }

  async function fetchListings() {
    const rows = await paged((page, n) => `/pim/pool/${vendor}/list?page=${page}&limit=${n}`, 1000);
    return rows.filter((p) => p.barcode).map((p) => {
      const img = (p.images || p.imageUrls || [])[0], q = p.inventoryQuantity ?? p.quantity ?? p.stock;
      return { remoteId: str(p.barcode), remoteProductId: str(p.productMainId), sku: str(p.vendorStockCode || p.erpId), barcode: str(p.barcode), name: str(p.title), groupName: str(p.title), variantName: '',
        image: str(typeof img === 'string' ? img : img && (img.url || img.imageUrl)), images: imageList(p.images || p.imageUrls), price: num(p.price), listPrice: num(p.comparePrice) || num(p.price),
        // Stok bilgisi gelmezse bilinmiyor sayılır (0 sayılıp eşleştirmeden düşmesin)
        stock: q == null ? null : num(q),
        active: !/reject|archive|passive/i.test(str(p.status)), brand: str(p.brandName) };
    });
  }

  const upload = (items) => call(`/pim/catalog/${vendor}/inventory-upload`, { method: 'POST', body: { items } });
  async function pushStock(items) { for (const part of chunk(items, 1000)) await upload(part.map((x) => ({ barcode: x.remoteId, inventoryQuantity: x.stock }))); }
  async function pushPrice(items) { for (const part of chunk(items, 1000)) await upload(part.map((x) => ({ barcode: x.remoteId, price: x.price, comparePrice: Math.max(x.listPrice || 0, x.price) }))); }

  // İşleme al: "picking" (müşteri artık iptal edemez)
  async function accept(order) {
    for (const p of order.packages.filter((x) => x.remote_id && x.status === 'open')) await call(`/oms/${vendor}/${p.remote_id}/update-shipment-status`, { method: 'POST', body: { status: 'picking' } });
  }
  // Kendi kargo anlaşmasıyla gönderimde takip no bildirilir (paket "kargoda" olur)
  // Kendi kargo anlaşmanızla gönderim: takip no + takip adresi zorunlu (adres, siparişteki kargo firmasıyla uyumlu olmalı)
  const TRACK = [[/yurt/i, 'https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code='], [/aras/i, 'https://kargotakip.araskargo.com.tr/mainpage.aspx?code='],
    [/mng|dhl/i, 'https://www.mngkargo.com.tr/gonderi-takip/?takipNo='], [/ptt/i, 'https://gonderitakip.ptt.gov.tr/Track/Verify?q='], [/s[üu]rat/i, 'https://suratkargo.com.tr/KargoTakip/?kargotakipno='],
    [/hepsi\s*jet/i, 'https://www.hepsijet.com/gonderi-takibi/'], [/sendeo/i, 'https://sendeo.com.tr/gonderi-takip?code=']];
  async function ship(order, pkg, { tracking }) {
    if (!pkg.remote_id || !tracking) return {};
    const firm = pkg.cargo_company || order.cargo_company || '';
    const t = TRACK.find(([re]) => re.test(firm));
    if (!t) throw new Error(`idefix takip adresi ister: “${firm || 'kargo firması'}” için takip adresi bilinmiyor. Kargo firmasını (Yurtiçi, Aras, MNG, PTT, Sürat, HepsiJet) seçin.`);
    await call(`/oms/${vendor}/${pkg.remote_id}/update-tracking-number`, { method: 'POST', body: { trackingNumber: tracking, trackingUrl: t[1] + encodeURIComponent(tracking) } });
    return {};
  }

  // Tanılama: ürün ve sipariş servisleri ayrı ayrı denenir; HTTP hatası açıklanır (401 anahtar, 403 yetki/IP, 404 satıcı no)
  async function diagnose() {
    const out = [], now = Date.now();
    await diagStep(out, 'Kimlik ve ürün servisi', async () => { const r = await call(`/pim/pool/${vendor}/list?page=1&limit=1`); return { detail: `erişildi · Satıcı ID ${vendor} · kabul edilen kimlik biçimi: ${MODES[mode][0]} · ${list(r).length ? 'ürün örneği alındı' : 'ürün yok'}` }; });
    await diagStep(out, 'Sipariş servisi (son 24 saat)', async () => { const r = await call(`/oms/${vendor}/list?page=1&limit=1&startDate=${encodeURIComponent(fmt(now - 864e5))}&endDate=${encodeURIComponent(fmt(now))}`); const rows = list(r); return { detail: `erişildi · ${r && (r.totalCount ?? r.total ?? r.totalElements) != null ? (r.totalCount ?? r.total ?? r.totalElements) + ' sipariş' : rows.length + ' sipariş örneği'}${rows[0] ? ` · örnek durum: ${rows[0].status} → ${idefixStatus(rows[0].status)}` : ''}` }; });
    return out;
  }

  // ---------- müşteri soruları: /pim/vendor/{vendor}/question/filter (sayfa 1'den, en fazla 50), cevap: .../question/{id}/answer ----------
  async function questions({ since, until = Date.now(), page = 0, size = 50 }) {
    const r = await call(`/pim/vendor/${vendor}/question/filter?page=${page + 1}&limit=${Math.min(50, size)}&startDate=${since}&endDate=${until}&sort=newest`);
    const list = r.items || r.data || r.questions || r.content || (Array.isArray(r) ? r : []);
    const items = list.map((x) => {
      const a = (x.productQuestionAnswer || x.answers || [])[0];
      const p = x.product && typeof x.product === 'object' ? x.product : { name: x.product };
      return {
        remoteId: String(x.id), text: str(x.question), askedAt: Date.parse(x.createdAt) || num(x.createdAt) || Date.now(),
        status: a ? 'answered' : x.isArchived ? 'other' : 'waiting', remoteStatus: a ? 'answered' : x.isArchived ? 'archived' : 'waiting',
        productName: str(p.name || p.title), productImage: str(p.image || p.imageUrl).replace('{size}', '300/'), barcode: str(p.barcode), customer: x.showMyName === false ? '' : str(x.customerName),
        answer: a ? str(a.answerBody || a.answer_body || a.text) : null, answeredAt: a ? Date.parse(a.createdAt) || null : null,
      };
    });
    return { items, hasNext: page + 1 < num(r.pageCount), total: num(r.totalCount) || items.length };
  }
  async function answer(q, text) { await call(`/pim/vendor/${vendor}/question/${encodeURIComponent(q.remote_id)}/answer`, { method: 'POST', body: { answer_body: text } }); }

  const missing = ['IDEFIX_API_KEY', 'IDEFIX_API_SECRET', 'IDEFIX_VENDOR_ID'].filter((k) => !env[k]);
  return {
    ...meta, type: 'idefix', enabled: !missing.length, missing,
    caps: { accept: 'remote', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, answer: { min: 2, max: 2000 } },
    fetchOrders, fetchListings, pushStock, pushPrice, accept, ship, diagnose, questions, answer,
  };
}
