// PttAVM. İki yol:
//  1) YENİ (önerilen): REST Entegrasyon API'si (integration-api.pttavm.com/api/v1, kargo: shipment.pttavm.com/api/v1).
//     Kimlik: her istekte "Api-Key" + "access-token" (satıcı panelinde Hesap Yönetimi → Entegrasyon Bilgileri'nde entegratör için
//     üretilen API Key ve Token) + her isteğe yeni "X-Correlation-Id". PttAVM token doğrulamasını zorunlu yaptı; eski yol kapanacak.
//  2) ESKİ: SOAP servisi (ws.pttavm.com:93, WS-Security kullanıcı adı / şifre). Yalnız API Key / Token girilmemişse kullanılır.
// Kaynak: developers.pttavm.com (Sipariş Kontrol V2, Stok Kontrol Listesi, Fiyat Stok Güncelle, Kargo Entegrasyonu).
import { http, basic, num, str, chunk, diagStep, sleep } from '../util.js';

// Küçük XML okuyucu: etiket ön eklerini (a:, s:) atar, tekrar eden etiketleri diziye çevirir
export function parseXml(xml) {
  const root = { children: [] };
  const stack = [root];
  const re = /<(\/?)([A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[6] !== undefined) { const t = m[6].trim(); if (t) stack[stack.length - 1].text = (stack[stack.length - 1].text || '') + decode(t); continue; }
    if (m[3] === 'xml' || m[0].startsWith('<?') || m[0].startsWith('<!')) continue;
    if (m[1]) { stack.pop(); continue; }
    const node = { name: m[3], children: [], nil: /nil="true"/.test(m[4]) };
    stack[stack.length - 1].children.push(node);
    if (!m[5]) stack.push(node);
  }
  return root;
}
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Düğümü düz nesneye çevir: { Alan: 'değer', Alt: [..] }
export function flat(node) {
  if (!node.children.length) return node.nil ? '' : node.text || '';
  const o = {}, multi = new Set();
  for (const c of node.children) {
    const v = flat(c);
    if (!(c.name in o)) o[c.name] = v;
    else { if (!multi.has(c.name)) { o[c.name] = [o[c.name]]; multi.add(c.name); } o[c.name].push(v); }
  }
  return o;
}
function findAll(node, test, out = []) {
  for (const c of node.children) { if (test(c)) out.push(c); else findAll(c, test, out); }
  return out;
}
const pick = (o, ...keys) => { for (const k of keys) { const hit = Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase()); if (hit && o[hit] !== '' && typeof o[hit] !== 'object') return o[hit]; } return ''; };

// SOAP çağrısı (WS-Security kullanıcı adı / şifre). Hem eski SOAP kanalı hem ürün yükleme (pttCatalog) kullanır.
function makeSoap(env) {
  const user = env.PTTAVM_USERNAME, pass = env.PTTAVM_PASSWORD;
  const URL_ = env.PTTAVM_SOAP_URL || 'https://ws.pttavm.com:93/service.svc';
  const NS = env.PTTAVM_NS || 'http://tempuri.org/';
  const IFACE = env.PTTAVM_INTERFACE || 'IService';
  async function soap(method, inner) {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="${NS}">
<soapenv:Header><wsse:Security soapenv:mustUnderstand="1" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"><wsse:UsernameToken><wsse:Username>${esc(user)}</wsse:Username><wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${esc(pass)}</wsse:Password></wsse:UsernameToken></wsse:Security></soapenv:Header>
<soapenv:Body><tem:${method}>${inner}</tem:${method}></soapenv:Body></soapenv:Envelope>`;
    const text = await http(URL_, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${NS}${IFACE}/${method}"` }, body: xml });
    const tree = parseXml(String(text));
    const fault = findAll(tree, (n) => n.name === 'Fault')[0];
    if (fault) throw new Error(`PttAVM ${method}: ${pick(flat(fault), 'faultstring', 'Reason', 'Text') || 'SOAP hatası'}`);
    return tree;
  }
  return { soap, URL_ };
}

function pttavmSoap(env, meta) {
  const user = env.PTTAVM_USERNAME, pass = env.PTTAVM_PASSWORD;
  const { soap, URL_ } = makeSoap(env);
  const ORDER_METHOD = env.PTTAVM_ORDER_METHOD || 'SiparisKontrolListesiV2';
  const STOCK_METHOD = env.PTTAVM_STOCK_METHOD || 'StokFiyatGuncelle3';
  const trDate = env.PTTAVM_DATE_FORMAT === 'tr';

  const fmt = (ms) => {
    const d = new Date(ms + 3 * 3600e3).toISOString();
    return trDate ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : d.slice(0, 19);
  };

  function mapStatus(s) {
    s = String(s).toLocaleLowerCase('tr');
    if (/iptal|cancel/.test(s)) return 'cancelled';
    if (/iade|return/.test(s)) return 'returned';
    if (/teslim edildi|deliver/.test(s)) return 'delivered';
    if (/kargo|gönderil|ship/.test(s)) return 'shipped';
    if (/hazırla|onay|process/.test(s)) return 'processing';
    return 'new';
  }

  async function fetchOrders(since, until) {
    const tree = await soap(ORDER_METHOD, `<tem:BaslangicTarihi>${fmt(since)}</tem:BaslangicTarihi><tem:BitisTarihi>${fmt(until)}</tem:BitisTarihi>`);
    // Sipariş kaydı: içinde sipariş numarası alanı olan her düğüm
    const recs = findAll(tree, (n) => n.children.some((c) => /^Siparis(No|Numarasi|Id)$/i.test(c.name)) && n.children.length > 3);
    const byNo = new Map();
    for (const node of recs) {
      const o = flat(node);
      const no = String(pick(o, 'SiparisNo', 'SiparisNumarasi', 'SiparisId'));
      if (!no) continue;
      // Ürün satırları: kaydın altında barkod/ürün adı taşıyan düğümler; yoksa kaydın kendisi tek satırdır
      const lineNodes = findAll(node, (n) => n.children.some((c) => /^(Barkod|UrunBarkod|UrunAdi)$/i.test(c.name)) && n !== node);
      const lines = (lineNodes.length ? lineNodes.map(flat) : [o]).map((l, i) => {
        const qty = num(pick(l, 'Adet', 'Miktar', 'UrunAdet'), 1);
        const total = num(pick(l, 'ToplamFiyat', 'Tutar', 'SatisFiyati', 'KdvDahilToplamTutar')) || num(pick(l, 'BirimFiyat', 'Fiyat', 'KdvDahilFiyat')) * qty;
        return {
          lineId: String(pick(l, 'SiparisDetayId', 'SiparisUrunId', 'LineId', 'Id') || `${no}-${i + 1}`),
          sku: str(pick(l, 'UrunKodu', 'StokKodu', 'SaticiUrunKodu')), barcode: str(pick(l, 'Barkod', 'UrunBarkod')), name: str(pick(l, 'UrunAdi', 'Urun')), image: '',
          quantity: qty, unitPrice: qty ? total / qty : total, total,
          status: /iptal/i.test(pick(l, 'Durum', 'SiparisDurumu', 'UrunDurum')) ? 'cancelled' : /iade/i.test(pick(l, 'Durum', 'SiparisDurumu', 'UrunDurum')) ? 'returned' : '', remoteKey: str(pick(l, 'Barkod', 'UrunBarkod')),
        };
      });
      const prev = byNo.get(no);
      if (prev) { for (const l of lines) if (!prev.items.some((x) => x.lineId === l.lineId)) prev.items.push(l); continue; }
      const status = str(pick(o, 'SiparisDurumu', 'Durum', 'DurumAdi'));
      const tarih = str(pick(o, 'SiparisTarihi', 'Tarih'));
      byNo.set(no, {
        remoteId: no, orderNumber: no, orderedAt: parseTrDate(tarih) || Date.now(), remoteStatus: status, status: mapStatus(status),
        customer: str(pick(o, 'MusteriAdi', 'AliciAdi', 'AdSoyad', 'Musteri')), phone: str(pick(o, 'Telefon', 'MusteriTelefon', 'AliciTelefon')), email: str(pick(o, 'Email', 'EPosta')),
        address: { name: str(pick(o, 'AliciAdi', 'MusteriAdi', 'AdSoyad')), line: str(pick(o, 'TeslimatAdresi', 'Adres', 'AliciAdres')), district: str(pick(o, 'Ilce', 'TeslimatIlce')), city: str(pick(o, 'Il', 'Sehir', 'TeslimatIl')), phone: str(pick(o, 'Telefon', 'AliciTelefon')) },
        total: num(pick(o, 'SiparisToplamTutar', 'ToplamTutar', 'Tutar')) || lines.reduce((s, l) => s + l.total, 0), currency: 'TRY',
        cargoCompany: str(pick(o, 'KargoFirmasi', 'KargoAdi')), tracking: str(pick(o, 'KargoTakipNo', 'KargoBarkod', 'BarkodNo')),
        items: lines, packages: null,
      });
    }
    return [...byNo.values()];
  }

  // Stok güncelleme (barkod + adet). Ürün listesi PttAVM'den çekilemiyorsa ürünler barkodla panelden eşleştirilir.
  // PttAVM ilan başına ayrı istek ister: bir turda en fazla 200 ilan (sunucu istek sınırı); gönderilenler işaretlenir, kalanı sonraki
  // senkronda. Bir ilandaki hata diğerlerini durdurmaz (yalnız art arda hatada — ör. kimlik / servis — tur kesilir).
  async function pushStock(items) {
    const done = [], errors = [];
    let streak = 0;
    for (const x of items.slice(0, 200)) {
      try { await soap(STOCK_METHOD, `<tem:item><Barkod>${esc(x.remoteId)}</Barkod><Miktar>${x.stock}</Miktar></tem:item>`); done.push(x.remoteId); streak = 0; } catch (e) {
        if (e.budget) throw e; // senkron istek bütçesi bitti: ilan hatası değil
        errors.push({ remoteId: x.remoteId, error: e.message });
        if (++streak >= 5 && !done.length) throw e; // servis / kimlik hatası: hepsi aynı hatayı verir
        if (streak >= 5) break;
      }
    }
    return { done, errors };
  }

  // Fiyat (KDV dahil satış fiyatı): UpdateProductsStockPrice, istekte en fazla 1000 ürün. İşlem kuyruğa alınır, trackingId döner.
  // Alanlar WCF sözleşmesindeki sırayla (alfabetik) yazılır; İskonto 0 = satış fiyatı doğrudan gönderilen fiyat.
  const REQ = 'http://schemas.datacontract.org/2004/07/ePttAVMService.Model.Requests';
  const money = (v) => (Math.round(num(v) * 100) / 100).toFixed(2);
  async function pushPrice(items) {
    for (const part of chunk(items, 1000)) {
      const rows = part.map((x) => `<r:ProductStockPriceRequest><r:Barcode>${esc(x.remoteId)}</r:Barcode><r:Discount>0</r:Discount><r:PriceWithVAT>${money(x.price)}</r:PriceWithVAT></r:ProductStockPriceRequest>`).join('');
      const tree = await soap('UpdateProductsStockPrice', `<tem:items xmlns:r="${REQ}">${rows}</tem:items>`);
      const res = findAll(tree, (n) => n.name === 'UpdateProductsStockPriceResult')[0];
      const o = res ? flat(res) : {};
      if (!res || String(pick(o, 'Success')).toLowerCase() !== 'true') throw new Error('PttAVM fiyat: ' + (pick(o, 'Message') || 'işlem kabul edilmedi'));
    }
  }

  async function fetchListings() {
    const tree = await soap(env.PTTAVM_LIST_METHOD || 'StokKontrolListesi', '');
    return findAll(tree, (n) => n.children.some((c) => /^Barkod$/i.test(c.name))).map(flat).map((o) => ({
      remoteId: str(pick(o, 'Barkod')), remoteProductId: str(pick(o, 'UrunId', 'Id')), sku: str(pick(o, 'UrunKodu', 'StokKodu')), barcode: str(pick(o, 'Barkod')),
      name: str(pick(o, 'UrunAdi', 'Urun')), image: str(pick(o, 'UrunResim', 'Resim')), price: num(pick(o, 'KDVli', 'Fiyat', 'SatisFiyati')), listPrice: 0, stock: num(pick(o, 'Miktar', 'Stok', 'StokMiktari')),
    })).filter((l) => l.remoteId);
  }

  // Kargo barkodu (REST). Depo numarası PTTAVM_WAREHOUSE_ID ile verilir.
  async function ship(order, pkg) {
    if (!env.PTTAVM_WAREHOUSE_ID || pkg.tracking) return {};
    const r = await http('https://shipment.pttavm.com/api/v1/create-barcode', {
      method: 'POST', headers: { Authorization: basic(env.PTTAVM_SHIPMENT_USER || user, env.PTTAVM_SHIPMENT_PASSWORD || pass), 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders: [{ order_id: order.order_number, warehouse_id: env.PTTAVM_WAREHOUSE_ID }] }),
    });
    const t = JSON.stringify(r).match(/"(?:tracking_id|trackingId|barcode)"\s*:\s*"?([\w-]+)/);
    return { tracking: t ? t[1] : '' };
  }

  // Tanılama: servis adresi, kimlik ve yöntem adları ayrı ayrı denenir; SOAP hata metni olduğu gibi gösterilir
  async function diagnose() {
    const out = [], now = Date.now();
    out.push({ name: 'Servis ayarları', ok: null, detail: `Adres ${URL_} · sipariş yöntemi ${ORDER_METHOD} · stok yöntemi ${STOCK_METHOD} · tarih biçimi ${trDate ? 'gg.aa.yyyy' : 'ISO'} (PttAVM dokümanındaki adlarla aynı olmalı)` });
    await diagStep(out, 'Siparişler (son 24 saat)', async () => { const o = await fetchOrders(now - 864e5, now); return { detail: `${o.length} sipariş okundu` }; });
    await diagStep(out, 'Ürün / stok listesi', async () => { const l = await fetchListings(); return { ok: l.length ? true : null, detail: l.length ? `${l.length} ürün` : 'Yanıt geldi ama ürün satırı tanınmadı (yöntem adı ya da alan adları farklı olabilir)' }; });
    out.push({ name: 'Kargo barkodu', ok: env.PTTAVM_WAREHOUSE_ID ? null : false, detail: env.PTTAVM_WAREHOUSE_ID ? `Depo ${env.PTTAVM_WAREHOUSE_ID} tanımlı (barkod servisi ilk gönderimde denenir)` : 'Depo numarası girilmemiş: kargo barkodu alınamaz' });
    await catalogDiag(out, catalog);
    return out;
  }

  const missing = ['PTTAVM_USERNAME', 'PTTAVM_PASSWORD'].filter((k) => !env[k]);
  const catalog = missing.length ? undefined : pttCatalog(soap);
  return {
    ...meta, type: 'pttavm', byOrderDate: true, enabled: !missing.length, missing,
    caps: { accept: 'local', split: 'local', ship: env.PTTAVM_WAREHOUSE_ID ? 'remote' : 'local', label: null, createProduct: false, price: true },
    fetchOrders, fetchListings, pushStock, pushPrice, ship, diagnose, catalog,
  };
}

function parseTrDate(s) {
  if (!s) return 0;
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0) - 3, +(m[5] || 0), +(m[6] || 0));
  const t = Date.parse(s);
  return Number.isFinite(t) ? (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? t : t - 3 * 3600e3) : 0;
}

// ---------- YENİ: REST Entegrasyon API'si (Api-Key + access-token) ----------
const API = 'https://integration-api.pttavm.com/api/v1', SHIP = 'https://shipment.pttavm.com/api/v1';
const DAY = 864e5, WINDOW = 39 * DAY; // sipariş sorgusunda tarih aralığı en fazla 40 gün
// Sipariş durumu (siparisDurumu): kargo_yapilmasi_bekleniyor, havale_onayi_bekleniyor, onay_surecinde, gonderilmis, tamamlandi,
// iptal, odeme_gecersiz, iade, gondericisine_teslim_edildi (gönderi iade olup göndericiye döndü)
export function pttStatus(s) {
  s = String(s || '').toLowerCase();
  if (/iptal|odeme_gecersiz/.test(s)) return 'cancelled';
  if (/iade|gondericisine/.test(s)) return 'returned';
  if (/tamamlandi/.test(s)) return 'delivered';
  if (/gonderil/.test(s)) return 'shipped';
  return 'new';
}
const ADI = (a, b) => [a, b].map(str).filter(Boolean).join(' ');
const uuid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);

export function normPttOrder(o) {
  const lines = (o.siparisUrunler || []).map((l, i) => {
    const qty = num(l.toplamIslemAdedi, 1), total = num(l.kdvDahilToplamTutar);
    const st = String(l.siparisDurumu || o.siparisDurumu || '');
    return {
      lineId: str(l.lineItemId || `${o.siparisNo}-${i + 1}`), sku: str(l.urunKodu || o.urunKodu), barcode: str(l.urunBarkod), name: str(l.urun || l.urunAdi || o.urunAdi), image: '',
      quantity: qty, unitPrice: qty ? total / qty : total, total, status: pttStatus(st) === 'cancelled' ? 'cancelled' : pttStatus(st) === 'returned' ? 'returned' : '',
      remoteKey: str(l.urunBarkod), remoteStatus: st,
    };
  });
  // Sipariş durumu canlı (iptal / iade olmayan) satırlardan; hepsi iptal / iadeyse biri iade → iade, değilse iptal
  // (tek satırın iadesi bütün siparişi iade saymasın: diğer satırların stoğu geri eklenmesin)
  const sts = lines.map((l) => pttStatus(l.remoteStatus));
  const live = sts.filter((x) => x !== 'cancelled' && x !== 'returned');
  const status = !live.length ? (sts.length ? (sts.includes('returned') ? 'returned' : 'cancelled') : 'new') : live.every((x) => x === 'delivered') ? 'delivered'
    : live.some((x) => x === 'shipped' || x === 'delivered') ? 'shipped' : 'new';
  const raw = (lines[0] && lines[0].remoteStatus) || '';
  const tr = (o.barcodes || []).find((b) => b && b.barcode);
  return {
    remoteId: str(o.siparisNo), orderNumber: str(o.siparisNo), orderedAt: parseTrDate(str(o.islemTarihi)) || Date.now(), remoteStatus: raw, status,
    awaitingPayment: /havale_onayi|onay_surecinde/.test(raw),
    customer: ADI(o.musteriAdi, o.musteriSoyadi), phone: str(o.telefonNo), email: str(o.eposta), customerId: str(o.musteriId),
    address: { name: ADI(o.musteriAdi, o.musteriSoyadi), line: str(o.siparisAdresi), district: str(o.siparisIlce), city: str(o.siparisIli), phone: str(o.telefonNo) },
    total: Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100, currency: 'TRY',
    cargoCompany: 'PTT Kargo', tracking: str(o.kargoBarkod || (tr && tr.barcode)),
    items: lines.map(({ remoteStatus, ...l }) => l), packages: null,
  };
}

function pttavmRest(env, meta) {
  const key = str(env.PTTAVM_API_KEY), token = str(env.PTTAVM_TOKEN);
  const headers = () => ({ 'Api-Key': key, 'access-token': token, 'X-Correlation-Id': uuid(), 'Content-Type': 'application/json', Accept: 'application/json' });
  const call = (url, { method = 'GET', body } = {}) => http(url, { method, headers: headers(), body: body && JSON.stringify(body) });
  const list = (r) => (Array.isArray(r) ? r : r && Array.isArray(r.data) ? r.data : r && Array.isArray(r.items) ? r.items : []);

  // orders/search sayfalama almaz: cevap yuvarlak bir sınırda (≥100, 50'nin katı) kesilmiş görünüyorsa aralık ikiye bölünüp yeniden sorulur
  // (en fazla 16 ek istek, en kısa 1 saat). Yine sınırdaysa okunanlar alınır, imleç o aralığın başında kalır (partialUntil) ve uyarı düşer.
  const capped = (n) => n >= 100 && n % 50 === 0;
  async function fetchOrders(since, until) {
    const out = new Map(), parts = [];
    for (let a = since; a < until; a += WINDOW) parts.push([a, Math.min(until, a + WINDOW)]);
    let extra = 16, cut = null;
    while (parts.length) {
      const [a, b] = parts.shift();
      const q = new URLSearchParams({ startDate: new Date(a).toISOString(), endDate: new Date(b).toISOString(), isActiveOrders: 'false' });
      const rows = list(await call(`${API}/orders/search?${q}`));
      if (capped(rows.length) && b - a > 3600e3 && extra >= 2) { extra -= 2; const m = a + Math.floor((b - a) / 2); parts.unshift([a, m], [m, b]); continue; }
      if (capped(rows.length) && (cut == null || a < cut)) cut = a;
      for (const o of rows) if (o && o.siparisNo) out.set(String(o.siparisNo), normPttOrder(o));
    }
    const res = [...out.values()];
    if (cut != null) { res.partialUntil = cut; res.warnings = [`PttAVM sipariş araması ${new Date(cut).toISOString().slice(0, 16)} sonrasında sınıra takılmış olabilir; eksik siparişler sonraki senkronda yeniden okunur`]; }
    return res;
  }
  async function getOrder(id) {
    const r = await call(`${API}/orders/${encodeURIComponent(id)}`).catch((e) => { if (/HTTP 404/.test(e.message)) return null; throw e; });
    const o = list(r)[0] || (r && r.siparisNo ? r : null);
    return o && o.siparisNo ? o : null;
  }
  const fetchOne = async (id) => { const o = await getOrder(id); if (!o) throw new Error('PttAVM: sipariş bulunamadı'); return normPttOrder(o); };
  const orderExists = async (id) => !!(await getOrder(id));

  // Ürünler: sayfalı arama (searchPage); varyantlı üründe her varyant ayrı ilan (variantBarkod).
  // Belgede tüm filtreler "zorunlu" ama örnekte boş; boş kategori kimliğini (sayı alanı) reddeden hesaplar var (HTTP 400). Bu yüzden
  // biçimler sırayla denenir: (1) hepsi boş, (2) kategori 0, (3) kategori alanları hiç gönderilmeden. Servisin kabul ettiği ilk biçim
  // kullanılır; aktif / pasif ve stoklu / stoksuz ürünler ayrı ayrı okunup barkoda göre birleştirilir.
  const STYLES = [
    (f) => ({ categoryId: '', subCategoryId: '', isActive: f.a, isInStock: f.s, merchantCategoryId: '' }),
    (f) => ({ categoryId: '0', subCategoryId: '0', isActive: f.a, isInStock: f.s, merchantCategoryId: '0' }),
    (f) => ({ isActive: f.a, isInStock: f.s }),
  ];
  const rejected = (e) => /HTTP 400|HTTP 422/.test(e.message);
  async function fetchListings() {
    // Filtresiz (tüm ürünler tek seferde) kabul edilirse yeterli
    try { return await listingsWith(STYLES[0], { a: '', s: '' }); } catch (e) { if (!rejected(e)) throw e; }
    const combos = [{ a: 'true', s: 'true' }, { a: 'true', s: 'false' }, { a: 'false', s: 'true' }, { a: 'false', s: 'false' }];
    let style = null, first = null, err = null;
    for (const st of STYLES) {
      try { first = await listingsWith(st, combos[0]); style = st; break; } catch (e) { if (!rejected(e)) throw e; err = e; }
    }
    if (!style) throw new Error(`PttAVM ürün listesi: servis arama filtrelerini kabul etmedi (${err.message.replace(/^.*?(HTTP \d+)/, '$1').trim()}). Tanılama'yı çalıştırıp sonucu Destek'e iletin.`);
    const seen = new Map(first.map((l) => [l.remoteId, l]));
    for (const f of combos.slice(1)) {
      // Pasif ürün filtresi bazı hesaplarda reddedilebilir: o parça atlanır, okunanlar kalır
      let rows = [];
      try { rows = await listingsWith(style, f); } catch (e) { if (!rejected(e)) throw e; }
      for (const l of rows) if (!seen.has(l.remoteId)) seen.set(l.remoteId, l);
    }
    return [...seen.values()];
  }
  async function listingsWith(style, f) {
    const out = [];
    let products = 0;
    for (let page = 1; page <= 200; page++) {
      const q = new URLSearchParams({ ...style(f), searchPage: String(page) });
      const rows = list(await call(`${API}/products/search?${q}`));
      products += rows.length;
      for (const p of rows) {
        const img = str((p.resimListesi && p.resimListesi[0] && p.resimListesi[0].url) || p.resim1Url);
        const base = { remoteProductId: str(p.urunId), sku: str(p.urunKodu), name: str(p.urunAdi), groupName: str(p.urunAdi), image: img, active: p.aktif !== false };
        const vs = (p.variantListesi || []).filter((v) => v && v.variantBarkod);
        if (!vs.length) { out.push({ ...base, remoteId: str(p.barkod), barcode: str(p.barkod), price: num(p.kdVli), listPrice: num(p.kdVli), stock: num(p.miktar) }); continue; }
        for (const v of vs) {
          const vn = [v.variant1Deger, v.variant2Deger].map(str).filter(Boolean).join(' / ');
          out.push({ ...base, remoteId: str(v.variantBarkod), barcode: str(v.variantBarkod), name: vn ? `${base.name} - ${vn}` : base.name, variantName: vn, price: num(p.kdVli) + num(v.fiyat), listPrice: num(p.kdVli) + num(v.fiyat), stock: num(v.miktar) });
        }
      }
      // rowCount ürün (satır) sayısıdır; varyantlı üründe ilan sayısı ürün sayısından fazladır, bu yüzden ürünler sayılır
      if (!rows.length || (rows[0] && rows[0].rowCount && products >= num(rows[0].rowCount))) break;
    }
    return out.filter((l) => l.remoteId);
  }

  // Stok ve fiyat: products/stock-prices (en fazla 1000 ürün / istek; aynı istek 5 dk içinde tekrarlanamaz). İşlem kuyruğa alınır,
  // trackingId ile sonuç sorgulanır (pushStatus → products/tracking-result). Stok 0–9999 aralığında olmalı.
  async function send(items) {
    const refs = [];
    for (const part of chunk(items, 1000)) {
      const r = await call(`${API}/products/stock-prices`, { method: 'POST', body: { items: part } });
      if (r && r.success === false) throw new Error('PttAVM: ' + (r.message || 'işlem kabul edilmedi'));
      if (r && r.trackingId) refs.push(r.trackingId);
    }
    return { refs };
  }
  const pushStock = (items) => send(items.map((x) => ({ barcode: x.remoteId, quantity: Math.max(0, Math.min(9999, Math.round(num(x.stock)))) })));
  const pushPrice = (items) => send(items.filter((x) => num(x.price) > 1).map((x) => ({ barcode: x.remoteId, priceWithVAT: Math.round(num(x.price) * 100) / 100, discount: 0 })));
  async function pushStatus(ref) {
    const r = await call(`${API}/products/tracking-result/${encodeURIComponent(ref)}`, { method: 'POST' });
    const st = String((r && r.status) || '').toLowerCase(), sub = (r && r.productsSubTrackingResult) || {};
    const done = /completed|cancelled/.test(st) || num(r && r.progress) >= 100;
    // Satır sonucu: yalnız tamamlanan / başarılı satır kabul; hata / iptal reddedildi; diğerleri (işleniyor) belirsiz
    const items = (sub.productBasedInfos || []).map((x) => { const s = String(x.status || ''); return { key: str(x.barcode), ok: /complet|success/i.test(s) ? true : /fail|error|cancel/i.test(s) ? false : null, error: [str(x.message), ...(x.failureReasons || []).map(str)].filter(Boolean).join(' · ') }; });
    return { done, items };
  }

  // Kargo barkodu: create-barcode → tracking_id → barcode-status (barkod hazır olunca). Depo: PTTAVM_WAREHOUSE_ID ya da mağazanın ilk deposu.
  // Barkod etiket almadan ÖNCE gerekir (etiket kolinin üstüne yapıştırılır): label() barkodu yoksa oluşturur, ship() yalnız eksikse.
  // Aynı siparişe ikinci kez barkod açılmasın: önce siparişte (kargoBarkod / barcodes) barkod var mı bakılır, bekleyen işlem
  // (tracking_id) aynı çalışma içinde yeniden sorgulanır.
  let warehouse = str(env.PTTAVM_WAREHOUSE_ID);
  const waiting = new Map(); // sipariş no → create-barcode tracking_id
  async function warehouses() { const r = await call(`${SHIP}/get-warehouse`, { method: 'POST', body: {} }); return list(r); }
  async function pollBarcode(no, tid) {
    for (let i = 0; tid && i < 3; i++) {
      await sleep(1500);
      const s = await call(`${SHIP}/barcode-status`, { method: 'POST', body: { tracking_id: tid } }).catch(() => null);
      if (!s) continue;
      if (s.status === 'error') { waiting.delete(no); throw new Error('PttAVM kargo barkodu: ' + (s.error || 'hata')); }
      const hit = (s.data || []).find((d) => String(d.order_id) === String(no) && (d.barcodes || []).length);
      if (s.status === 'completed' && hit) { waiting.delete(no); return str(hit.barcodes[0]); }
    }
    return '';
  }
  async function barcodeFor(order) {
    const no = str(order.order_number);
    if (waiting.has(no)) { const b = await pollBarcode(no, waiting.get(no)); if (b) return b; }
    const cur = await getOrder(order.remote_id || no).catch(() => null);
    const had = cur && normPttOrder(cur).tracking;
    if (had) return had;
    if (waiting.has(no)) return '';
    if (!warehouse) { const w = (await warehouses())[0]; if (!w) throw new Error('PttAVM: mağazaya tanımlı depo bulunamadı (kargo barkodu için depo gerekli)'); warehouse = str(w.id); }
    const r = await call(`${SHIP}/create-barcode`, { method: 'POST', body: { orders: [{ order_id: no, warehouse_id: Number(warehouse) || warehouse }] } });
    if (r && (r.success === false || r.error === true)) throw new Error('PttAVM kargo barkodu: ' + (r.message || 'oluşturulamadı'));
    const tid = r && r.tracking_id;
    if (tid) waiting.set(no, tid);
    return pollBarcode(no, tid);
  }
  async function ship(order, pkg) {
    if (pkg && (pkg.tracking || pkg.barcode)) return {};
    const code = await barcodeFor(order);
    if (code) return { tracking: code, cargoCompany: 'PTT Kargo' };
    return { tracking: '', note: 'PttAVM barkodu hazırlıyor; siparişler yenilenince barkod gelir' };
  }
  // Etiket: get-barcode-tag (type "zpl" → termal yazıcı ZPL; boş → HTML). ZPL gelmezse panel etiketi PttAVM barkoduyla basılır.
  const zplOf = (r) => (typeof r === 'string' ? (/\^XA/.test(r) ? r : '') : r && typeof r === 'object' ? Object.values(r).map(zplOf).find(Boolean) || '' : '');
  async function label(order, pkg = {}) {
    const code = str(pkg.barcode || pkg.tracking) || await barcodeFor(order);
    if (!code) return { pending: 'PttAVM kargo barkodunu hazırlıyor; birkaç saniye sonra tekrar deneyin.', step: 'waiting' };
    const info = { barcode: code, tracking: code, cargoCompany: 'PTT Kargo', agreement: 'pttavm' };
    let r = null, why = '';
    try { r = await call(`${SHIP}/get-barcode-tag`, { method: 'POST', body: { barcode: code, order_id: str(order.order_number), type: 'zpl' } }); } catch (e) { why = e.message; }
    const zpl = zplOf(r);
    if (zpl) return { ...info, label: { format: 'zpl', data: zpl, filename: `pttavm-${order.order_number}-${pkg.no || 1}.zpl` } };
    return { ...info, panel: true, note: `PttAVM etiketi alınamadı${why ? ` (${why.slice(0, 160)})` : ''}; etiket PttAVM barkoduyla panelden basıldı.` };
  }

  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    const okAuth = await diagStep(out, 'Kimlik (Api-Key + Token)', async () => { const r = await call(`${API}/shipping/cargo-profiles`); return { detail: `Bağlantı kuruldu · ${((r && r.cargoProfiles) || []).length} kargo profili` }; });
    if (!okAuth) { out.push({ name: 'İpucu', ok: null, detail: '401/403: API Key ya da Token hatalı veya bu entegratör için yetki verilmemiş. Satıcı paneli → Hesap Yönetimi → Entegrasyon Bilgileri → entegratör → Görüntüle: API Key ve Token oradan kopyalanır.' }); return out; }
    await diagStep(out, 'Siparişler (son 7 gün)', async () => { const o = await fetchOrders(now - 7 * DAY, now); return { detail: `${o.length} sipariş${o[0] ? ` · örnek #${o[0].orderNumber}: ${o[0].remoteStatus || '?'} → ${o[0].status}` : ''}` }; });
    if (orderId) await diagStep(out, `Sipariş ${orderId}`, async () => { const o = await fetchOne(orderId); return { detail: `${o.items.length} ürün · ${o.remoteStatus} → ${o.status}${o.tracking ? ` · barkod ${o.tracking}` : ''}` }; });
    await diagStep(out, 'Ürün listesi', async () => { const l = await fetchListings(); return { ok: l.length ? true : null, detail: l.length ? `${l.length} ilan` : 'Cevap geldi ama ürün bulunamadı' }; });
    await diagStep(out, 'Kargo depoları', async () => { const w = await warehouses(); return { ok: w.length ? true : null, detail: w.length ? w.map((x) => `${x.name} (${x.id})`).join(', ') : 'Depo tanımlı değil: kargo barkodu alınamaz' }; });
    await catalogDiag(out, catalog);
    return out;
  }

  // Ürün yükleme REST'te doğrulanamadı: PttAVM'in ürün ekleme servisi (UpdateProductsV3) SOAP'ta; eski kullanıcı adı / şifre de girildiyse kullanılır
  const catalog = env.PTTAVM_USERNAME && env.PTTAVM_PASSWORD ? pttCatalog(makeSoap(env).soap) : undefined;
  return {
    ...meta, type: 'pttavm', byOrderDate: true, enabled: true, missing: [], api: 'rest',
    caps: { accept: 'local', split: 'local', ship: 'remote', label: 'remote', createProduct: false, price: true },
    fetchOrders, fetchOne, orderExists, fetchListings, pushStock, pushPrice, pushStatus, ship, label, diagnose, catalog,
  };
}

// ---------- ürün yükleme (SOAP Katalog Entegrasyonu: "Ürün Ekleme Güncelleme") ----------
// Kaynak: PttAVM servis sözleşmesi (https://ws.pttavm.com:93/service.svc/service?wsdl); WSDL'den svcutil 8.0 ile üretilmiş istemci:
// github.com/zfrtemel/IntegrationService → Providers/IntegrationService.Providers.Pttavm/Connected Services/PttAvmService/Reference.cs.
//   UpdateProductsV3(ProductV3Request[] items) → ProductsUpdateResult { Success, Message, TrackingId, CountOfProductsToBeProcessed }
//   GetProductsTrackingResult(string trackingId) → { Status, Progress, ProductsSubTrackingResult { ProductBasedInfos: [{ Barcode, ProductId, Status, Message, FailureReasons }] } }
//   GetMainCategories() → { success, main_category: [{ id, name }] } · GetCategoryTree(parent_id, last_update) → { success, category_tree: [{ id, name, parent_id, children }] }
//   GetCargoProfiles() → [{ Id, Name, Description, Type }] · BarkodKontrolBulk(string[] Barkod) → StokKontrolDetay[] (UrunId > 0: barkod PttAVM'de kayıtlı)
// PttAVM kategorilerinde özellik servisi yok: marka serbest metin (Brand), varyant tanımı serbest metin (Definition / Value).
// REST Entegrasyon API'sinde ürün ekleme ucu ve alan adları doğrulanamadı; bu yüzden ürün yükleme eski API kullanıcı adı / şifresiyle (SOAP) yapılır.
// Varyantlar: VariantV3.Price alanının (fiyat farkı mı, satış fiyatı mı) anlamı belgelenmediği için her varyant kendi barkoduyla ayrı ürün olarak açılır.
// Not: UpdateProductsV3 aynı barkodlu mevcut ürünü günceller (varyant gönderilmezse varyantlarını siler): PttAVM'de zaten kayıtlı barkod gönderilmez.
const REQ_NS = 'http://schemas.datacontract.org/2004/07/ePttAVMService.Model.Requests';
const ARR_NS = 'http://schemas.microsoft.com/2003/10/Serialization/Arrays';
// ProductV3Request alanları DataContract (WSDL) sırasıyla: WCF sıra dışı alanı yok sayar
const V3_ORDER = ['Active', 'Barcode', 'BasketMaxQuantity', 'Brand', 'CargoProfileId', 'CatalogBarcode', 'CategoryId', 'Desi', 'Discount', 'EstimatedCourierDelivery', 'Gtin', 'Images',
  'IsCargoFromSupplier', 'LongDescription', 'Name', 'NoShippingProduct', 'Parts', 'PriceWithVat', 'PriceWithoutVat', 'ProductCode', 'Quantity', 'ShortDescription', 'SingleBox', 'VATRate',
  'Variants', 'WarrantyDuration', 'WarrantySupplier'];
export function v3Xml(p) {
  const out = [];
  for (const k of V3_ORDER) {
    const v = p[k];
    if (v == null || v === '') continue;
    if (k === 'Images') { if (v.length) out.push(`<r:Images>${v.map((u) => `<r:ProductImageV3><r:Url>${esc(u)}</r:Url></r:ProductImageV3>`).join('')}</r:Images>`); continue; }
    out.push(`<r:${k}>${esc(typeof v === 'boolean' ? String(v) : v)}</r:${k}>`);
  }
  return `<r:ProductV3Request>${out.join('')}</r:ProductV3Request>`;
}
const kid = (n, name) => (n && n.children.find((c) => c.name === name)) || null;
const kids = (n, name) => (n ? n.children.filter((c) => c.name === name) : []);
const txt = (n, name) => { const c = kid(n, name); return c ? str(c.text) : ''; };

export function pttCatalog(soap) {
  // Kategoriler: önce tüm ağaç (GetCategoryTree, boş parent_id); ağaç alt düğümsüz gelirse ana kategoriler (GetMainCategories) tek tek açılır.
  // Ürün yalnız son kategoriye (alt kategorisi olmayan) açılır.
  let catCache = null;
  const okOf = (tree, what) => {
    const s = findAll(tree, (n) => n.name === 'success')[0];
    if (s && str(s.text).toLowerCase() === 'false') { const e = findAll(tree, (n) => n.name === 'error_message')[0]; throw Object.assign(new Error(`PttAVM ${what}: ${str(e && e.text) || 'başarısız'}`), { ptt: true }); }
  };
  const treeOf = async (parent) => {
    const t = await soap('GetCategoryTree', `<tem:parent_id>${esc(parent)}</tem:parent_id><tem:last_update></tem:last_update>`);
    okOf(t, 'kategori ağacı');
    return kids(findAll(t, (n) => n.name === 'category_tree')[0], 'Category');
  };
  async function load() {
    const leaves = [];
    const walk = (node, path) => {
      const id = txt(node, 'id'), name = txt(node, 'name'), sub = kids(kid(node, 'children'), 'Category');
      if (!id) return;
      if (!sub.length) { leaves.push({ id, name, path: path.join(' › ') }); return; }
      for (const c of sub) walk(c, [...path, name]);
    };
    // Boş parent_id'yi kabul etmeyen servis (SOAP hatası) ana kategorilerden yürünür; servisin kendi hata cevabı (success=false) olduğu gibi döner
    let top = [];
    try { top = await treeOf(''); } catch (e) { if (e.budget || e.ptt) throw e; }
    if (!top.some((n) => kids(kid(n, 'children'), 'Category').length)) {
      const t = await soap('GetMainCategories', '');
      okOf(t, 'ana kategoriler');
      const mains = kids(findAll(t, (n) => n.name === 'main_category')[0], 'category').map((n) => ({ id: txt(n, 'id'), name: txt(n, 'name') })).filter((x) => x.id);
      if (mains.length) {
        top = [];
        for (const m of mains) {
          const sub = await treeOf(m.id);
          // Ağaç ana kategorinin kendisiyle ya da doğrudan alt kategorileriyle gelebilir
          const self = sub.length === 1 && txt(sub[0], 'id') === m.id;
          for (const n of self ? kids(kid(sub[0], 'children'), 'Category') : sub) walk(n, [m.name]);
          if (!sub.length) leaves.push({ id: m.id, name: m.name, path: '' });
        }
        return leaves;
      }
    }
    for (const n of top) walk(n, []);
    return leaves;
  }
  async function categories(q) {
    if (!catCache || Date.now() - catCache.at > 6 * 3600e3) catCache = { at: Date.now(), all: await load() };
    const k = String(q || '').toLocaleLowerCase('tr').trim();
    return { total: catCache.all.length, items: catCache.all.filter((c) => !k || `${c.name} ${c.path} ${c.id}`.toLocaleLowerCase('tr').includes(k)).slice(0, 60) };
  }
  const allCategories = async () => { await categories(''); return catCache.all; };

  // Kargo profilleri (isteğe bağlı seçenek: adı ya da numarası yazılır)
  let profiles = null;
  async function cargoProfiles() {
    if (!profiles) profiles = findAll(await soap('GetCargoProfiles', ''), (n) => n.name === 'CargoProfileModel').map((n) => ({ id: txt(n, 'Id'), name: txt(n, 'Name') })).filter((x) => x.id);
    return profiles;
  }
  // PttAVM'de zaten kayıtlı barkodlar (BarkodKontrolBulk, 100'lük): bunlar yeni ürün olarak gönderilmez (UpdateProductsV3 mevcut ürünün üstüne yazar)
  const taken = new Set(), checked = new Set();
  async function prepare(prs) {
    const todo = [...new Set(prs.map((p) => str(p.barcode)).filter((b) => b && !checked.has(b)))];
    for (const part of chunk(todo, 100)) {
      const t = await soap('BarkodKontrolBulk', `<tem:Barkod xmlns:arr="${ARR_NS}">${part.map((b) => `<arr:string>${esc(b)}</arr:string>`).join('')}</tem:Barkod>`);
      for (const n of findAll(t, (x) => x.name === 'StokKontrolDetay')) if (num(txt(n, 'UrunId')) > 0 && txt(n, 'Barkod')) taken.add(txt(n, 'Barkod'));
      for (const b of part) checked.add(b);
    }
  }
  async function build(pr, map, { opts = {} } = {}) {
    const missing = [];
    const cat = Number(map.remote_id);
    if (!Number.isInteger(cat) || cat <= 0) throw new Error(`PttAVM kategori kimliği geçersiz: ${map.remote_id}`);
    const barcode = str(pr.barcode).trim();
    if (!barcode) missing.push('barkod');
    else if (taken.has(barcode)) missing.push('barkod PttAVM\'de başka bir üründe kayıtlı (yeni ürün açılmaz; ilanı PttAVM\'den eşleştirin)');
    if (!str(pr.name).trim()) missing.push('ürün adı');
    const imgs = [...new Set([pr.image, ...(pr.images || [])].map(str).filter((u) => /^https?:\/\//i.test(u)))];
    if (!imgs.length) missing.push('görsel');
    if (!(num(pr.price) > 0)) missing.push('fiyat');
    const vat = num(pr.vat ?? 20);
    if (!(vat >= 0 && vat <= 100)) missing.push(`KDV oranı “${pr.vat}” geçersiz`);
    // Kargo profili (isteğe bağlı): numara ya da PttAVM'deki adı; yazılan profil yoksa engeller (tanımlı profiller listelenir)
    let profile = null;
    if (str(opts.cargoProfileId)) {
      const want = str(opts.cargoProfileId), list = await cargoProfiles().catch(() => null);
      const hit = list && list.find((x) => x.id === want || x.name.toLocaleLowerCase('tr') === want.toLocaleLowerCase('tr'));
      if (hit) profile = Number(hit.id);
      else if (!list && /^\d+$/.test(want)) profile = Number(want);
      else missing.push(`kargo profili “${want}” PttAVM'de yok${list && list.length ? ` (tanımlı: ${list.slice(0, 5).map((x) => `${x.name} ${x.id}`).join(', ')})` : ''}; PttAVM seçeneklerinden düzeltin`);
    }
    let days = null;
    if (str(opts.preparingDay)) {
      days = Number(str(opts.preparingDay).replace(',', '.'));
      if (!(Number.isInteger(days) && days >= 1 && days <= 30)) { missing.push(`kargoya veriliş süresi “${str(opts.preparingDay)}” geçersiz (1–30 gün; PttAVM seçeneklerinden düzeltin)`); days = null; }
    }
    const payload = {
      Active: true, Barcode: barcode, Brand: str(pr.brand).slice(0, 100), CargoProfileId: profile, CategoryId: cat, Desi: Math.max(1, Math.round(num(pr.desi, 1) * 100) / 100), Discount: 0,
      EstimatedCourierDelivery: days, Images: imgs, LongDescription: str(pr.description) || str(pr.name), Name: str(pr.name).trim().slice(0, 200),
      PriceWithVat: (Math.round(num(pr.price) * 100) / 100).toFixed(2), ProductCode: str(pr.sku).slice(0, 100), Quantity: Math.max(0, Math.min(9999, Math.round(num(pr.stock)))), VATRate: vat,
    };
    return { key: barcode, missing, payload };
  }
  // Gönderim: istekte en fazla 100 ürün; her parça bir takip kimliği. Kayıt "takip:barkodlar" (parça sonucu bu kimlikle sorgulanır).
  // İlk parça reddedilirse hata; sonraki parça reddedilirse o parçanın ürünleri sonuçta "gönderilemedi" olur (gönderilenler kaybolmaz).
  async function send(items) {
    const refs = [];
    for (const part of chunk(items, 100)) {
      const keys = part.map((x) => x.Barcode).join(',');
      try {
        const t = await soap('UpdateProductsV3', `<tem:items xmlns:r="${REQ_NS}">${part.map(v3Xml).join('')}</tem:items>`);
        const res = findAll(t, (n) => n.name === 'UpdateProductsV3Result')[0];
        const o = res ? flat(res) : {};
        const tid = str(pick(o, 'TrackingId'));
        if (!res || String(pick(o, 'Success')).toLowerCase() !== 'true' || !tid) throw new Error('PttAVM ürün gönderimi: ' + (str(pick(o, 'Message')) || 'işlem kabul edilmedi'));
        refs.push(`${tid}:${keys}`);
      } catch (e) {
        if (e.budget || !refs.length) throw e;
        refs.push(`0:${keys}`);
      }
    }
    return { ref: refs.join(';') };
  }
  async function tracking(tid) {
    const t = await soap('GetProductsTrackingResult', `<tem:trackingId>${esc(tid)}</tem:trackingId>`);
    return findAll(t, (n) => n.name === 'GetProductsTrackingResultResult')[0] || null;
  }
  async function status(ref) {
    const items = [];
    let pending = false;
    for (const part of String(ref).split(';').filter(Boolean)) {
      const i = part.indexOf(':'), tid = i < 0 ? part : part.slice(0, i), keys = i < 0 ? [] : part.slice(i + 1).split(',').filter(Boolean);
      if (tid === '0') { for (const k of keys) items.push({ key: k, ok: false, status: 'PttAVM\'e gönderilemedi', error: 'Bu parça PttAVM tarafından kabul edilmedi; ürünü yeniden gönderin' }); continue; }
      const r = await tracking(tid);
      const st = txt(r, 'Status'), done = /complet|cancel|fail|error/i.test(st) || num(txt(r, 'Progress')) >= 100;
      if (!done) pending = true;
      const seen = new Set();
      for (const n of findAll(r || { children: [] }, (x) => x.name === 'ProductBasedInfo')) {
        const s = txt(n, 'Status'), key = txt(n, 'Barcode');
        const why = [txt(n, 'Message'), ...findAll(kid(n, 'FailureReasons') || { children: [] }, () => true).map((x) => str(x.text))].filter(Boolean);
        const ok = /complet|success/i.test(s) ? true : /fail|error|cancel/i.test(s) ? false : null;
        seen.add(key);
        items.push({ key, ok, status: ok === true ? 'PttAVM kabul etti' : ok === false ? 'PttAVM kabul etmedi' : s || 'İşleniyor', error: ok === false ? [...new Set(why)].join(' · ') || 'PttAVM kabul etmedi' : '' });
        if (ok === null) pending = true;
      }
      if (done) for (const k of keys) if (!seen.has(k)) items.push({ key: k, ok: false, status: 'PttAVM sonuç vermedi', error: 'PttAVM bu ürün için sonuç vermedi' });
    }
    return { done: !pending, items };
  }
  async function raw(tid) { const r = await tracking(String(tid).split(':')[0]); return r ? flat(r) : null; }
  return {
    categories, allCategories, attributes: async () => [], values: async () => [], build, send, status, raw, prepare, chunk: 100,
    options: [{ k: 'cargoProfileId', label: 'Kargo profili: adı ya da numarası (isteğe bağlı; PttAVM → Kargo Profilleri)' }, { k: 'preparingDay', label: 'Kargoya veriliş süresi, gün (isteğe bağlı)' }],
    cargoProfiles,
  };
}
// Tanılama: ürün yükleme servisi (yalnız eski kullanıcı adı / şifre girildiyse)
async function catalogDiag(out, catalog) {
  if (!catalog) { out.push({ name: 'Ürün yükleme', ok: null, detail: 'Eski API kullanıcı adı / şifresi girilmemiş: ürün yükleme kapalı (PttAVM ürün ekleme servisi SOAP\'ta)' }); return; }
  await diagStep(out, 'Ürün yükleme: kategori ağacı', async () => { const c = await catalog.allCategories(); return { ok: c.length ? true : null, detail: c.length ? `${c.length} son kategori` : 'Kategori okunamadı' }; });
  await diagStep(out, 'Ürün yükleme: kargo profilleri', async () => { const p = await catalog.cargoProfiles(); return { ok: null, detail: p.length ? p.map((x) => `${x.name} (${x.id})`).join(', ') : 'Kargo profili yok (isteğe bağlı)' }; });
}

// Seçim: API Key + Token girildiyse yeni REST API; yoksa eski SOAP (kullanıcı adı / şifre). İkisi de yoksa eksik alan API Key + Token.
export function pttavm(env, meta) {
  if (str(env.PTTAVM_API_KEY) && str(env.PTTAVM_TOKEN)) return pttavmRest(env, meta);
  if (env.PTTAVM_USERNAME && env.PTTAVM_PASSWORD) return { ...pttavmSoap(env, meta), api: 'soap' };
  const c = pttavmSoap(env, meta);
  return { ...c, enabled: false, missing: [!str(env.PTTAVM_API_KEY) && 'PTTAVM_API_KEY', !str(env.PTTAVM_TOKEN) && 'PTTAVM_TOKEN'].filter(Boolean) };
}
