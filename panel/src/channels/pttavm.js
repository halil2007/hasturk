// PttAVM. Siparişler ve stok: SOAP servisi (ws.pttavm.com:93, WS-Security kullanıcı adı/şifre).
// Kargo barkodu: REST (shipment.pttavm.com/api/v1). Mağaza paneli → Entegrasyon → API kullanıcısı.
// Not: PttAVM'in servis alan adları hesap ve sürüme göre değişebildiği için cevaplar esnek okunur;
// yöntem adları ortam değişkenleriyle değiştirilebilir (bkz. README).
import { http, basic, num, str, diagStep } from '../util.js';

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

export function pttavm(env, meta) {
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
          status: /iptal/i.test(pick(l, 'Durum', 'SiparisDurumu', 'UrunDurum')) ? 'cancelled' : '', remoteKey: str(pick(l, 'Barkod', 'UrunBarkod')),
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
  async function pushStock(items) {
    for (const x of items) {
      await soap(STOCK_METHOD, `<tem:item><Barkod>${esc(x.remoteId)}</Barkod><Miktar>${x.stock}</Miktar></tem:item>`);
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
    ...meta, type: 'pttavm', byOrderDate: true, enabled: !missing.length, missing, beta: true,
    caps: { accept: 'local', split: 'local', ship: env.PTTAVM_WAREHOUSE_ID ? 'remote' : 'local', label: null, createProduct: false, price: false },
    fetchOrders, fetchListings, pushStock, ship, diagnose,
  };
}

function parseTrDate(s) {
  if (!s) return 0;
  const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0) - 3, +(m[5] || 0), +(m[6] || 0));
  const t = Date.parse(s);
  return Number.isFinite(t) ? (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? t : t - 3 * 3600e3) : 0;
}
