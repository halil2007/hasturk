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

function pttavmSoap(env, meta) {
  const user = env.PTTAVM_USERNAME, pass = env.PTTAVM_PASSWORD;
  const URL_ = env.PTTAVM_SOAP_URL || 'https://ws.pttavm.com:93/service.svc';
  const NS = env.PTTAVM_NS || 'http://tempuri.org/';
  const IFACE = env.PTTAVM_INTERFACE || 'IService';
  const ORDER_METHOD = env.PTTAVM_ORDER_METHOD || 'SiparisKontrolListesiV2';
  const STOCK_METHOD = env.PTTAVM_STOCK_METHOD || 'StokFiyatGuncelle3';
  const trDate = env.PTTAVM_DATE_FORMAT === 'tr';

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
    return out;
  }

  const missing = ['PTTAVM_USERNAME', 'PTTAVM_PASSWORD'].filter((k) => !env[k]);
  return {
    ...meta, type: 'pttavm', byOrderDate: true, enabled: !missing.length, missing,
    caps: { accept: 'local', split: 'local', ship: env.PTTAVM_WAREHOUSE_ID ? 'remote' : 'local', label: null, createProduct: false, price: true },
    fetchOrders, fetchListings, pushStock, pushPrice, ship, diagnose,
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
  // Sipariş durumu: satırlardan (hepsi iptal → iptal; biri iade → iade; en ileri gönderim durumu)
  const sts = lines.map((l) => pttStatus(l.remoteStatus));
  const live = sts.filter((x) => x !== 'cancelled');
  const status = !live.length ? (sts.length ? 'cancelled' : 'new') : live.includes('returned') ? 'returned' : live.every((x) => x === 'delivered') ? 'delivered'
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

  async function fetchOrders(since, until) {
    const out = new Map();
    for (let a = since; a < until; a += WINDOW) {
      const b = Math.min(until, a + WINDOW);
      const q = new URLSearchParams({ startDate: new Date(a).toISOString(), endDate: new Date(b).toISOString(), isActiveOrders: 'false' });
      for (const o of list(await call(`${API}/orders/search?${q}`))) if (o && o.siparisNo) out.set(String(o.siparisNo), normPttOrder(o));
    }
    return [...out.values()];
  }
  async function getOrder(id) {
    const r = await call(`${API}/orders/${encodeURIComponent(id)}`).catch((e) => { if (/HTTP 404/.test(e.message)) return null; throw e; });
    const o = list(r)[0] || (r && r.siparisNo ? r : null);
    return o && o.siparisNo ? o : null;
  }
  const fetchOne = async (id) => { const o = await getOrder(id); if (!o) throw new Error('PttAVM: sipariş bulunamadı'); return normPttOrder(o); };
  const orderExists = async (id) => !!(await getOrder(id));

  // Ürünler: sayfalı arama (searchPage); varyantlı üründe her varyant ayrı ilan (variantBarkod)
  // Filtreler belgede "zorunlu" ama örnekte boş: önce boş (tüm ürünler) denenir; servis reddederse aktif ürünler stoklu + stoksuz ayrı okunur
  async function fetchListings() {
    try { return await listingsWith({ isActive: '', isInStock: '' }); } catch (e) {
      if (!/HTTP 400|HTTP 422/.test(e.message)) throw e;
      const seen = new Map();
      for (const f of [{ isActive: 'true', isInStock: 'true' }, { isActive: 'true', isInStock: 'false' }]) for (const l of await listingsWith(f)) seen.set(l.remoteId, l);
      return [...seen.values()];
    }
  }
  async function listingsWith(f) {
    const out = [];
    for (let page = 1; page <= 200; page++) {
      const q = new URLSearchParams({ categoryId: '', subCategoryId: '', ...f, merchantCategoryId: '', searchPage: String(page) });
      const rows = list(await call(`${API}/products/search?${q}`));
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
      if (!rows.length || (rows[0] && rows[0].rowCount && out.length >= num(rows[0].rowCount))) break;
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
    const items = (sub.productBasedInfos || []).map((x) => ({ key: str(x.barcode), ok: !/cancel/i.test(String(x.status || '')), error: [str(x.message), ...(x.failureReasons || []).map(str)].filter(Boolean).join(' · ') }));
    return { done, items };
  }

  // Kargo barkodu: create-barcode → tracking_id → barcode-status (barkod hazır olunca). Depo: PTTAVM_WAREHOUSE_ID ya da mağazanın ilk deposu.
  let warehouse = str(env.PTTAVM_WAREHOUSE_ID);
  async function warehouses() { const r = await call(`${SHIP}/get-warehouse`, { method: 'POST', body: {} }); return list(r); }
  async function ship(order, pkg) {
    if (pkg && pkg.tracking) return {};
    if (!warehouse) { const w = (await warehouses())[0]; if (!w) throw new Error('PttAVM: mağazaya tanımlı depo bulunamadı (kargo barkodu için depo gerekli)'); warehouse = str(w.id); }
    const r = await call(`${SHIP}/create-barcode`, { method: 'POST', body: { orders: [{ order_id: order.order_number, warehouse_id: Number(warehouse) || warehouse }] } });
    if (r && (r.success === false || r.error === true)) throw new Error('PttAVM kargo barkodu: ' + (r.message || 'oluşturulamadı'));
    const tid = r && r.tracking_id;
    for (let i = 0; tid && i < 3; i++) {
      await sleep(1500);
      const s = await call(`${SHIP}/barcode-status`, { method: 'POST', body: { tracking_id: tid } }).catch(() => null);
      if (!s) continue;
      if (s.status === 'error') throw new Error('PttAVM kargo barkodu: ' + (s.error || 'hata'));
      const hit = (s.data || []).find((d) => String(d.order_id) === String(order.order_number) && (d.barcodes || []).length);
      if (s.status === 'completed' && hit) return { tracking: str(hit.barcodes[0]), cargoCompany: 'PTT Kargo' };
    }
    return { tracking: '', note: 'PttAVM barkodu hazırlıyor; siparişler yenilenince barkod gelir' };
  }

  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    const okAuth = await diagStep(out, 'Kimlik (Api-Key + Token)', async () => { const r = await call(`${API}/shipping/cargo-profiles`); return { detail: `Bağlantı kuruldu · ${((r && r.cargoProfiles) || []).length} kargo profili` }; });
    if (!okAuth) { out.push({ name: 'İpucu', ok: null, detail: '401/403: API Key ya da Token hatalı veya bu entegratör için yetki verilmemiş. Satıcı paneli → Hesap Yönetimi → Entegrasyon Bilgileri → entegratör → Görüntüle: API Key ve Token oradan kopyalanır.' }); return out; }
    await diagStep(out, 'Siparişler (son 7 gün)', async () => { const o = await fetchOrders(now - 7 * DAY, now); return { detail: `${o.length} sipariş${o[0] ? ` · örnek #${o[0].orderNumber}: ${o[0].remoteStatus || '?'} → ${o[0].status}` : ''}` }; });
    if (orderId) await diagStep(out, `Sipariş ${orderId}`, async () => { const o = await fetchOne(orderId); return { detail: `${o.items.length} ürün · ${o.remoteStatus} → ${o.status}${o.tracking ? ` · barkod ${o.tracking}` : ''}` }; });
    await diagStep(out, 'Ürün listesi', async () => { const l = await fetchListings(); return { ok: l.length ? true : null, detail: l.length ? `${l.length} ilan` : 'Cevap geldi ama ürün bulunamadı' }; });
    await diagStep(out, 'Kargo depoları', async () => { const w = await warehouses(); return { ok: w.length ? true : null, detail: w.length ? w.map((x) => `${x.name} (${x.id})`).join(', ') : 'Depo tanımlı değil: kargo barkodu alınamaz' }; });
    return out;
  }

  return {
    ...meta, type: 'pttavm', byOrderDate: true, enabled: true, missing: [], api: 'rest',
    caps: { accept: 'local', split: 'local', ship: 'remote', label: null, createProduct: false, price: true },
    fetchOrders, fetchOne, orderExists, fetchListings, pushStock, pushPrice, pushStatus, ship, diagnose,
  };
}

// Seçim: API Key + Token girildiyse yeni REST API; yoksa eski SOAP (kullanıcı adı / şifre). İkisi de yoksa eksik alan API Key + Token.
export function pttavm(env, meta) {
  if (str(env.PTTAVM_API_KEY) && str(env.PTTAVM_TOKEN)) return pttavmRest(env, meta);
  if (env.PTTAVM_USERNAME && env.PTTAVM_PASSWORD) return { ...pttavmSoap(env, meta), api: 'soap' };
  const c = pttavmSoap(env, meta);
  return { ...c, enabled: false, missing: [!str(env.PTTAVM_API_KEY) && 'PTTAVM_API_KEY', !str(env.PTTAVM_TOKEN) && 'PTTAVM_TOKEN'].filter(Boolean) };
}
