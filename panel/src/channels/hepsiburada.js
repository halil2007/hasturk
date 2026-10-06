// Hepsiburada Marketplace API (yollar ve alanlar Hepsiburada'nın yayımladığı OpenAPI dokümanları ve canlı yanıt yapılarıyla doğrulandı).
// Merchant Portal → Ayarlar → Entegrasyon: Merchant ID, kullanıcı adı / servis anahtarı ve ENTEGRATÖR ADI.
// Önemli: User-Agent başlığı Merchant Portal'da tanımlı entegratör adıyla BİREBİR aynı olmalı (ör. "hasturk_dev");
// "merchantId - uygulama" biçimi 401/403 ile reddedilir.
//   Siparişler/paketler: oms-external · İlan/stok/fiyat/buybox: listing-external · Müşteri soruları: api-asktoseller-merchant
import { http, basic, num, str, chunk, diagStep, isImageAttr, imageList } from '../util.js';

export function hepsiburada(env, meta) {
  const m = env.HB_MERCHANT_ID, user = env.HB_USERNAME || m, pass = env.HB_PASSWORD;
  // Test ortamı (SIT): Hepsiburada canlı API bilgilerini test adımları tamamlanınca verir; o zamana kadar tüm istekler -sit sunucularına gider
  const test = env.HB_TEST === '1' ? '-sit' : '';
  const OMS = `https://oms-external${test}.hepsiburada.com`, LST = `https://listing-external${test}.hepsiburada.com`;
  const headers = (json = true) => ({
    Authorization: basic(user, pass),
    'User-Agent': env.HB_USER_AGENT || '',
    Accept: 'application/json',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  });
  // Gövdesiz (GET) istekte Content-Type gönderilmez: bazı Hepsiburada sunucuları bunu reddedebiliyor (HTTP 520)
  // Aracı sunucu (isteğe bağlı): Hepsiburada bazı servislerde Cloudflare'den gelen istekleri 520 ile kapatıyor. Adres girilirse tüm
  // Hepsiburada istekleri kendi hostinginizdeki hb-proxy.php üzerinden (sabit IP) gider. Aracı yalnız *.hepsiburada.com'a iletir.
  const proxy = str(env.HB_PROXY_URL), pkey = str(env.HB_PROXY_KEY);
  async function hb(url, opts = {}) {
    if (!proxy) return http(url, opts);
    const h = { ...(opts.headers || {}), 'X-Proxy-Key': pkey };
    let b = opts.body;
    // Çok parçalı form (FormData): PHP ham gövdeyi okuyabilsin diye bayt olarak, gerçek içerik türü ayrı başlıkta gönderilir
    if (b instanceof FormData) {
      const rq = new Request('https://x.invalid/', { method: 'POST', body: b });
      b = await rq.arrayBuffer();
      h['X-Content-Type'] = rq.headers.get('content-type');
      h['Content-Type'] = 'application/octet-stream';
    }
    try { return await http(`${proxy}${proxy.includes('?') ? '&' : '?'}u=${encodeURIComponent(url)}`, { ...opts, headers: h, body: b }); }
    catch (e) {
      // Hata mesajında aracı sunucu yerine gerçek Hepsiburada adresi görünsün
      let ph = proxy; try { const x = new URL(proxy); ph = x.host + x.pathname; } catch { /* adres olduğu gibi */ }
      let real = url; try { const x = new URL(url); real = x.host + x.pathname; } catch { /* adres olduğu gibi */ }
      e.message = e.message.replace(ph, `${real} (aracı sunucu üzerinden)`);
      throw e;
    }
  }
  const call = (url, opts = {}) => hb(url, { ...opts, headers: headers(!!opts.body), body: opts.body && JSON.stringify(opts.body) });
  const list = (r) => (Array.isArray(r) ? r : (r && (r.items || r.data || r.listings || r.packages)) || []);
  const money = (v) => (v && typeof v === 'object' ? num(v.amount ?? v.value) : num(v));

  // Hepsiburada alan adları bazı servislerde PascalCase (Id, PackageNumber…): büyük/küçük harf duyarsız okuma
  const g = (o, ...keys) => { if (!o) return undefined; for (const k of keys) { if (o[k] != null) return o[k]; const K = k[0].toUpperCase() + k.slice(1); if (o[K] != null) return o[K]; } return undefined; };
  const page = (r) => (Array.isArray(r) ? r : (r && (g(r, 'items', 'data', 'listings') || [])) || []);
  const D = 864e5;

  // Sipariş satırı (açık satır: LineRepresentation · paket satırı: PackageLine)
  function lineOf(it) {
    const qty = num(g(it, 'quantity'), 1);
    const total = money(g(it, 'totalPrice')) || money(g(it, 'price', 'unitPrice')) * qty;
    return {
      lineId: str(g(it, 'lineItemId', 'id')), sku: str(g(it, 'merchantSku', 'merchantSKU')), barcode: str(g(it, 'productBarcode', 'barcode')), name: str(g(it, 'productName', 'name')),
      image: str(g(it, 'productImageUrlFormat')).replace('{size}', '300'),
      quantity: qty, unitPrice: qty ? total / qty : total, total,
      status: /cancel|iptal/i.test(g(it, 'status') || '') ? 'cancelled' : '', remoteKey: str(g(it, 'hbSku', 'sku', 'hepsiburadaSku')),
      orderNumber: str(g(it, 'orderNumber', 'orderId')), orderDate: g(it, 'orderDate'), dueDate: Date.parse(g(it, 'dueDate') || '') || null,
      // Hepsiburada'nın satırda bildirdiği komisyon (TL) ya da oran (%); ikisi de yoksa boş (tahmin kullanılır)
      commission: g(it, 'commission') != null ? money(g(it, 'commission')) : g(it, 'commissionRate') != null ? Math.round(total * num(g(it, 'commissionRate'))) / 100 : null,
    };
  }
  // Adres: açık satırdaki shippingAddress / sipariş ayrıntısındaki deliveryAddress (il = city, ilçe = town, mahalle = district)
  const addrOf = (a = {}, fallbackName = '') => ({ name: str(g(a, 'name') || fallbackName), line: str(g(a, 'address')), district: str(g(a, 'town') || g(a, 'district')), city: str(g(a, 'city')), phone: str(g(a, 'phoneNumber', 'phone')), email: str(g(a, 'email')) });

  // Panel siparişi: Hepsiburada satırlarını sipariş numarasına göre toplar
  function makeOrders() {
    const map = new Map();
    const rank = { new: 0, processing: 1, shipped: 2, delivered: 3 };
    return {
      map,
      touch(orderNumber, { date, customer, address, customerId } = {}) {
        let o = map.get(orderNumber);
        if (!o) {
          o = { remoteId: orderNumber, orderNumber, orderedAt: Date.parse(date) || Date.now(), remoteStatus: 'new', status: 'new', customer: '', phone: '', email: '', address: {}, total: 0, currency: 'TRY', cargoCompany: '', tracking: '', items: [], packages: [] };
          map.set(orderNumber, o);
        }
        if (customer && !o.customer) o.customer = customer;
        if (customerId && !o.customerId) o.customerId = String(customerId);
        if (address && address.city && !o.address.city) { o.address = address; o.phone = o.phone || address.phone; o.email = o.email || address.email; if (!o.customer) o.customer = address.name; }
        return o;
      },
      addLine(o, l) {
        if (!o.items.some((i) => i.lineId === l.lineId)) { o.items.push(l); if (!l.status) o.total += l.total; }
        if (l.dueDate && !l.status && (!o.shipBy || l.dueDate < o.shipBy)) o.shipBy = l.dueDate;
      },
      bump(o, s) { if ((rank[s] ?? 0) > (rank[o.status] ?? 0)) o.status = s; },
    };
  }

  // Sayfalı okuma: en fazla max sayfa; stop(sayfa) true dönerse durur
  async function pages(base, { limit, max, offsetKey = 'offset', stop }) {
    const rows = [];
    for (let i = 0; i < max; i++) {
      const r = page(await call(`${base}${base.includes('?') ? '&' : '?'}${offsetKey}=${i * limit}&limit=${limit}`));
      rows.push(...r);
      if (r.length < limit || (stop && stop(r))) break;
    }
    return rows;
  }

  // Siparişler: açık satırlar (paketlenecek) + paketler (kargoya hazır) + kargodaki / teslim edilen / iptal listeleri.
  // Kargo/teslim/iptal listeleri yalnız paket ve sipariş numarası verir: panelde ayrıntısı gerekenler sipariş numarasıyla okunur.
  async function fetchOrders(since, until) {
    const O = makeOrders(), errors = [];
    // 1) Açık satırlar (yeni siparişler)
    for (const it of await pages(`${OMS}/orders/merchantId/${m}`, { limit: 100, max: 50 })) {
      const l = lineOf(it);
      if (!l.orderNumber) continue;
      const o = O.touch(l.orderNumber, { date: l.orderDate, customerId: g(it, 'customerId'), customer: str(g(it, 'customerName')), address: addrOf(g(it, 'shippingAddress') || {}, str(g(it, 'customerName'))) });
      O.addLine(o, l);
      if (str(g(it, 'cargoCompany')) && !o.cargoCompany) o.cargoCompany = str(g(it, 'cargoCompany'));
    }
    // 2) Paketlenmiş, kargoya verilmemiş paketler (en fazla 10 / istek, "Offset" büyük harfle)
    try {
      for (const pk of await pages(`${OMS}/packages/merchantId/${m}`, { limit: 10, max: 100, offsetKey: 'Offset' })) {
        const lines = (g(pk, 'items') || []).map(lineOf);
        const no = (lines.find((l) => l.orderNumber) || {}).orderNumber;
        if (!no) continue;
        const address = { name: str(g(pk, 'recipientName', 'customerName')), line: str(g(pk, 'shippingAddressDetail')), district: str(g(pk, 'shippingTown') || g(pk, 'shippingDistrict')), city: str(g(pk, 'shippingCity')), phone: str(g(pk, 'phoneNumber')), email: str(g(pk, 'email')) };
        const o = O.touch(no, { date: g(pk, 'orderDate'), customerId: g(pk, 'customerId'), customer: str(g(pk, 'customerName')), address });
        for (const l of lines) O.addLine(o, { ...l, dueDate: l.dueDate || Date.parse(g(pk, 'dueDate') || '') || null });
        O.bump(o, 'processing');
        const pn = str(g(pk, 'packageNumber'));
        if (pn && !o.packages.some((x) => x.remoteId === pn)) o.packages.push({ remoteId: pn, items: lines.map((l) => ({ line_id: l.lineId, qty: l.quantity })), status: 'open', remoteStatus: 'Packaged', cargoCompany: str(g(pk, 'cargoCompany')), tracking: '', barcode: str(g(pk, 'barcode')), packed: true });
        if (!o.cargoCompany) o.cargoCompany = str(g(pk, 'cargoCompany'));
      }
    } catch (e) { errors.push('paketler: ' + e.message); }
    // 3) Kargodaki / teslim edilen paketler ve iptal edilen satırlar (tarih filtresi yok; yeniden eskiye, since'e kadar)
    const detail = new Map();
    const need = async (no) => {
      if (O.map.has(no)) return O.map.get(no);
      if (!detail.has(no)) {
        if (detail.size >= 200) return null;
        detail.set(no, null);
        try {
          const r = await call(`${OMS}/orders/merchantId/${m}/ordernumber/${encodeURIComponent(no)}`);
          const a = addrOf(g(r, 'deliveryAddress') || {}, str(g(g(r, 'customer') || {}, 'name')));
          const o = O.touch(no, { date: g(r, 'orderDate'), customer: str(g(g(r, 'customer') || {}, 'name')) || a.name, address: a });
          for (const it of g(r, 'items') || []) O.addLine(o, lineOf(it));
          detail.set(no, o);
        } catch (e) { errors.push(`sipariş ${no}: ${e.message}`); }
      }
      return detail.get(no);
    };
    const feeds = [['shipped', 'ShippedDate', 'shipped'], ['delivered', 'DeliveredDate', 'delivered']];
    for (const [path, dateKey, status] of feeds) {
      try {
        const old = (r) => r.length && r.every((x) => (Date.parse(g(x, dateKey) || '') || Infinity) < since);
        for (const x of await pages(`${OMS}/packages/merchantId/${m}/${path}`, { limit: 50, max: 40, stop: old })) {
          const at = Date.parse(g(x, dateKey) || '') || 0;
          if (at && at < since) continue;
          const no = str(g(x, 'OrderNumber') || (g(x, 'OrderNumbers') || [])[0]);
          const o = no && await need(no);
          if (!o) continue;
          O.bump(o, status);
          const pn = str(g(x, 'PackageNumber'));
          const live = o.items.filter((i) => !i.status);
          const pk = o.packages.find((p) => p.remoteId === pn);
          if (pk) { pk.status = 'shipped'; pk.remoteStatus = path; pk.barcode = pk.barcode || str(g(x, 'Barcode')); }
          else if (pn) o.packages.push({ remoteId: pn, items: live.map((l) => ({ line_id: l.lineId, qty: l.quantity })), status: 'shipped', remoteStatus: path, cargoCompany: o.cargoCompany, tracking: str(g(x, 'Barcode')), barcode: str(g(x, 'Barcode')), packed: true });
        }
      } catch (e) { errors.push(`${path}: ${e.message}`); }
    }
    try {
      const old = (r) => r.length && r.every((x) => (Date.parse(g(x, 'cancelDate') || '') || Infinity) < since);
      for (const x of await pages(`${OMS}/orders/merchantId/${m}/cancelled`, { limit: 50, max: 40, stop: old })) {
        const at = Date.parse(g(x, 'cancelDate') || '') || 0;
        if (at && at < since) continue;
        const o = await need(str(g(x, 'orderNumber')));
        if (!o) continue;
        const it = o.items.find((i) => i.lineId === str(g(x, 'lineItemId')));
        if (it && !it.status) { it.status = 'cancelled'; o.total -= it.total; }
      }
    } catch (e) { errors.push('iptaller: ' + e.message); }
    const out = [];
    for (const o of O.map.values()) {
      if (o.items.length && o.items.every((i) => i.status === 'cancelled')) o.status = 'cancelled';
      for (const i of o.items) { delete i.orderNumber; delete i.orderDate; delete i.dueDate; }
      o.total = Math.max(0, Math.round(o.total * 100) / 100);
      if (!o.packages.length) o.packages = null; // paket yoksa paneldeki paket bölmesi korunur
      o.remoteStatus = o.status;
      if (!o.cargoCompany) o.cargoCompany = ((o.packages || [])[0] || {}).cargoCompany || '';
      out.push(o);
    }
    if (errors.length) out.warnings = errors;
    return out;
  }

  async function fetchListings() {
    const out = [];
    for (let offset = 0; offset < 100000; offset += 1000) {
      const r = await call(`${LST}/listings/merchantid/${m}?offset=${offset}&limit=1000`);
      const rows = list(r);
      for (const l of rows) {
        out.push({
          remoteId: str(l.hepsiburadaSku || l.hbSku), remoteProductId: str(l.hepsiburadaSku), sku: str(l.merchantSku), barcode: str(l.barcode || ''), name: str(l.productName || l.merchantSku),
          groupName: str(l.productName || ''), variantName: '',
          image: str(l.imageUrl || l.image || ''), price: money(l.price), listPrice: money(l.price), stock: num(l.availableStock), active: l.isSalable !== false,
        });
      }
      if (rows.length < 1000) break;
    }
    // İlan servisi ürün adı / barkod / görsel vermez: kataloğa alınmış ürünlerin bilgisi merchantSku ile katalog servisinden eklenir
    // (eşleştirme barkodla da yapılabilsin, Eşleştirme sayfasında ürün adı görünsün). Servis cevap vermezse ilanlar olduğu gibi kalır.
    if (out.some((l) => !l.barcode || l.name === l.sku)) {
      const info = await catalogInfo().catch(() => new Map());
      for (const l of out) {
        const x = info.get(l.sku.toLowerCase());
        if (!x) continue;
        if (x.name && (!l.name || l.name === l.sku)) { l.name = x.name; l.groupName = l.groupName || x.name; }
        if (x.barcode && !l.barcode) l.barcode = x.barcode;
        if (x.brand) l.brand = x.brand;
        if (x.images.length) { l.images = x.images; if (!l.image) l.image = x.images[0]; }
      }
    }
    return out;
  }
  async function catalogInfo() {
    const out = new Map();
    const attrsOf = (it) => {
      const o = {};
      for (const src of [g(it, 'attributes'), g(it, 'baseAttributes'), g(it, 'variantTypeAttributes')]) {
        if (Array.isArray(src)) for (const a of src) { const k = str(g(a, 'name', 'attributeName', 'key', 'id')), v = g(a, 'value', 'attributeValue'); if (k && v != null) o[k] = str(v); }
        else if (src && typeof src === 'object') for (const [k, v] of Object.entries(src)) if (v != null && typeof v !== 'object') o[k] = str(v);
      }
      return o;
    };
    for (const st of ['MATCHED', 'CREATED', 'MATCHED_WITH_STAGED']) {
      for (let pg = 0; pg < 30; pg++) {
        let r;
        try { r = await call(`${CAT}/api/products/products-by-merchant-and-status?page=${pg}&size=100&version=1&merchantId=${encodeURIComponent(m)}&productStatus=${st}`, { tries: 1 }); }
        catch { if (!pg && st === 'MATCHED') return out; break; }
        const d = g(r, 'data');
        const rows = Array.isArray(d) ? d : page(d && typeof d === 'object' ? (g(d, 'content') ? { items: g(d, 'content') } : d) : r);
        for (const it of rows) {
          const a = attrsOf(it), sku = str(g(it, 'merchantSku') || a.merchantSku);
          if (!sku) continue;
          out.set(sku.toLowerCase(), {
            name: str(g(it, 'productName', 'name') || a.UrunAdi), barcode: str(g(it, 'barcode') || a.Barcode), brand: str(g(it, 'brand') || a.Marka),
            images: imageList([].concat(g(it, 'images') || [], [a.Image1, a.Image2, a.Image3, a.Image4, a.Image5].filter(Boolean))),
          });
        }
        if (rows.length < 100) break;
      }
    }
    return out;
  }

  async function upload(kind, rows) {
    for (const part of chunk(rows, 4000)) {
      try { await call(`${LST}/listings/merchantid/${m}/${kind}-uploads`, { method: 'POST', body: part }); } catch (e) {
        if (kind === 'stock' && e.status === 404) await call(`${LST}/listings/merchantid/${m}/inventory-uploads`, { method: 'POST', body: part });
        else throw e;
      }
    }
  }
  const pushStock = (items) => upload('stock', items.map((x) => ({ hepsiburadaSku: x.remoteId, merchantSku: x.sku, availableStock: x.stock })));
  const pushPrice = (items) => upload('price', items.map((x) => ({ hepsiburadaSku: x.remoteId, merchantSku: x.sku, price: x.price })));

  // Paketleme: her grup Hepsiburada'da ayrı paket olur (ayrı kargo barkodu)
  async function split(order, groups) {
    const packages = [];
    for (const g of groups) {
      const r = await call(`${OMS}/packages/merchantId/${m}`, {
        method: 'POST',
        body: { lineItemRequests: g.items.map((x) => ({ id: x.line_id, quantity: x.qty })), parcelQuantity: 1, deci: Math.max(1, num(g.desi, 1)) },
      });
      const x = Array.isArray(r) ? r[0] : r;
      packages.push({ remoteId: str(x && (x.packageNumber || x.packageId || x.id)), items: g.items, tracking: str(x && (x.trackingNumber || x.barcode)) });
    }
    return { packages, message: `${packages.length} paket Hepsiburada'da oluşturuldu.` };
  }

  // Ortak barkod (Hepsiburada anlaşmalı kargo etiketi): GET .../packages/merchantid/{m}/packagenumber/{paket}/labels
  // Yalnız Hepsiburada'nın ortak barkod verdiği firmalarda (ör. HepsiJET, Aras) gelir; paketin firması başka ise etiket verilmez ve
  // kargo firması değiştirilince (changecargocompany) aynı servis etiketi verir. Her hata durumunda firma seçimi önerilir.
  async function label(order, pkg, { prefer } = {}) {
    if (!pkg.remote_id) return { pending: 'Önce paketleyin (Hepsiburada paketi oluşmalı)' };
    let lab;
    try { lab = await labelFile(pkg, prefer); } catch (e) {
      let info = null;
      try { info = await call(pkgUrl(pkg)); } catch { /* bilgi alınamadı */ }
      const firm = str(g(info, 'cargoCompany', 'cargoCompanyName')) || str(pkg.cargo_company);
      const mutual = /mutual barcode|ortak barkod|common barcode/i.test(e.message);
      return {
        pending: mutual
          ? `Hepsiburada bu paket için ortak barkod vermiyor: paketin kargo firması${firm ? ` “${firm}”` : ''} Hepsiburada'nın ortak barkod verdiği firmalardan değil. `
            + 'Aşağıdan Hepsiburada anlaşmalı bir firma (ör. HepsiJET, Aras) seçin; firma Hepsiburada\'da değiştirilir ve etiket hemen yeniden istenir.'
          : `Hepsiburada etiketi alınamadı: ${e.message}${firm ? ` (paketin kargo firması: ${firm})` : ''}. Kargo firmasını değiştirip yeniden deneyebilirsiniz.`,
        changeCargo: true, cargoCompany: firm || undefined,
      };
    }
    return lab ? { label: lab } : { pending: 'Hepsiburada etiketi henüz hazır değil; birkaç dakika sonra tekrar deneyin.', changeCargo: true };
  }
  // Etiket dosyası: biçim değeri firmaya göre farklı kabul ediliyor (HepsiJET "ZPL" kabul eder; Aras servisi "ZPL"yi tanımayıp
  // 500 / "Requested value 'ZPL' was not found" döner). Sırayla denenir: ZPL, biçimsiz, Zpl, zpl, PDF, Pdf, pdf.
  const FORMATS = ['?format=ZPL', '', '?format=Zpl', '?format=zpl', '?format=PDF', '?format=Pdf', '?format=pdf'];
  const formatErr = (e) => /requested value|was not found|format|1051|enum/i.test(e.message);
  // prefer 'pdf': normal yazıcı için önce Hepsiburada'nın kendi PDF'i istenir (ZPL'yi dış serviste çevirmeye gerek kalmaz)
  async function labelFile(pkg, prefer) {
    const base = `${OMS}/packages/merchantid/${m}/packagenumber/${encodeURIComponent(pkg.remote_id)}/labels`;
    const order = prefer === 'pdf' ? [...FORMATS.filter((q) => /pdf/i.test(q)), ...FORMATS.filter((q) => !/pdf/i.test(q))] : FORMATS;
    let lastErr = null;
    for (const q of order) {
      let res;
      try { res = await hb(base + q, { headers: headers(false), raw: true, tries: 1 }); } catch (e) {
        lastErr = e;
        // Ortak barkod hatası biçimden bağımsızdır: diğer biçimleri denemeden döner
        if (/mutual barcode|ortak barkod|common barcode/i.test(e.message)) throw e;
        const st = e.status || Number((/HTTP (\d{3})/.exec(e.message) || [])[1]);
        if (![400, 404, 415, 422, 500].includes(st) || (st === 500 && !formatErr(e))) throw e;
        continue;
      }
      const lab = await parseLabel(res, pkg);
      if (lab) return lab;
    }
    if (lastErr) throw lastErr;
    return null;
  }
  async function parseLabel(res, pkg) {
    const type = res.headers.get('content-type') || '';
    if (/pdf|octet-stream/i.test(type)) {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (!buf.length) return null;
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      if (/\^XA/.test(s.slice(0, 2000))) return { format: 'zpl', data: s, filename: `hepsiburada-${pkg.remote_id}.zpl` };
      return { format: 'pdf', data: btoa(s), filename: `hepsiburada-${pkg.remote_id}.pdf` };
    }
    const text = await res.text();
    let data = text;
    try {
      const j = JSON.parse(text);
      const pick = (o) => (typeof o === 'string' ? o : Array.isArray(o) ? o.map(pick).filter(Boolean).join('\n')
        : o && (pick(g(o, 'zpl', 'zplData', 'label', 'labelData', 'data', 'content', 'pdf', 'barcodeLabel', 'labels', 'items')) || ''));
      data = pick(j);
    } catch { /* düz ZPL */ }
    data = String(data || '').trim();
    if (!data) return null;
    if (!/\^XA/.test(data) && /^[A-Za-z0-9+/=\s]+$/.test(data)) {
      try { const dec = atob(data.replace(/\s/g, '')); if (/\^XA/.test(dec)) data = dec; else if (dec.startsWith('%PDF')) return { format: 'pdf', data: data.replace(/\s/g, ''), filename: `hepsiburada-${pkg.remote_id}.pdf` }; } catch { /* olduğu gibi */ }
    }
    if (!/\^XA/.test(data)) return null;
    return { format: 'zpl', data, filename: `hepsiburada-${pkg.remote_id}.zpl` };
  }

  const pkgUrl = (pkg) => `${OMS}/packages/merchantId/${m}/packagenumber/${encodeURIComponent(pkg.remote_id)}`;
  // Paketin değiştirilebileceği kargo firmaları (yalnızca kargoya verilmemiş paketlerde)
  async function cargoOptions(order, pkg) {
    if (!pkg || !pkg.remote_id) return [];
    const r = await call(`${pkgUrl(pkg)}/changablecargocompanies`);
    return page(r).filter((c) => g(c, 'isActive') !== false).map((c) => ({ id: str(g(c, 'shortName', 'cargoCompanyShortName')), name: str(g(c, 'name') || g(c, 'shortName')), current: !!g(c, 'isSelected', 'selected') || (!!pkg.cargo_company && str(g(c, 'name')).toLowerCase() === String(pkg.cargo_company).toLowerCase()) }))
      .filter((c) => c.id);
  }
  async function changeCargo(order, pkg, cargo) {
    if (!pkg.remote_id) throw new Error('Önce paketleyin');
    await call(`${pkgUrl(pkg)}/changecargocompany`, { method: 'PUT', body: { CargoCompanyShortName: cargo.id } });
    return { remoteId: pkg.remote_id, cargoCompany: cargo.name, resetLabel: true };
  }
  // Paketi boz (unpack): satırlar tekrar "paketlenecek" durumuna döner
  async function cancelPackage(order, pkg) {
    if (!pkg.remote_id) return;
    await call(`${pkgUrl(pkg)}/unpack`, { method: 'POST', body: {} });
  }
  const pack = (order, pkgs) => split(order, pkgs.map((p) => ({ items: p.items, desi: p.desi })));

  // Buybox sıralaması (listing API): Variants[].{Sku, BuyboxOrders[{Rank, MerchantName, Price}]}. Bizim sıramız mağaza adıyla
  // bulunur (HB_MERCHANT_NAME); tek satıcı varsa sıra 1'dir.
  const myName = String(env.HB_MERCHANT_NAME || '').trim().toLocaleLowerCase('tr');
  async function buybox(remoteIds) {
    const out = [];
    for (const part of chunk(remoteIds, 10)) {
      const r = await call(`${LST}/buybox-orders/merchantid/${m}?skuList=${part.map(encodeURIComponent).join(',')}`);
      // Resmi şemada yanıt tanımı yok; görülen biçimler: {Variants:[{Sku, BuyboxOrders}]}, {Variants:{Variant:[…]}},
      // [{Variant:{…}}] ve satır başına doğrudan sıra veren [{hepsiburadaSku, rank}]
      let vars = g(r, 'variants') || g(r, 'data') || (Array.isArray(r) ? r : []);
      if (vars && !Array.isArray(vars)) vars = [].concat(g(vars, 'variant') || []);
      for (let v of vars || []) {
        if (g(v, 'variant')) v = g(v, 'variant');
        if (!g(v, 'buyboxOrders') && g(v, 'rank') != null) { out.push({ remoteId: str(g(v, 'hepsiburadaSku', 'sku')), rank: num(g(v, 'rank')) || null, buyboxPrice: null, second: null, third: null, multi: num(g(v, 'rank')) > 1 }); continue; }
        const sellers = (g(v, 'buyboxOrders') || []).slice().sort((a, c) => num(g(a, 'rank')) - num(g(c, 'rank')));
        const mine = myName ? sellers.find((x) => str(g(x, 'merchantName')).toLocaleLowerCase('tr') === myName) : null;
        const rank = mine ? num(g(mine, 'rank')) || sellers.indexOf(mine) + 1 : sellers.length === 1 ? 1 : null;
        out.push({ remoteId: str(g(v, 'sku', 'hepsiburadaSku')), rank, buyboxPrice: money(g(sellers[0], 'price')) || null, second: money(g(sellers[1], 'price')) || null, third: money(g(sellers[2], 'price')) || null,
          multi: sellers.length > 1, ...(rank || sellers.length < 2 ? {} : { error: 'Mağaza adı girilmedi: Entegrasyonlar → Hepsiburada → Mağaza adı' }) });
      }
    }
    return out;
  }

  // ---------- müşteri soruları ("Satıcıya Sor") ----------
  const QNA = `https://api-asktoseller-merchant${test}.hepsiburada.com/api/v1.0`;
  const qh = () => ({ ...headers(), merchantId: String(m) });
  const QST = { WaitingForAnswer: 'waiting', 1: 'waiting', Answered: 'answered', 2: 'answered', Rejected: 'rejected', 3: 'rejected', AutoClosed: 'other', 4: 'other' };
  async function questions({ since, page: p = 0, size = 50 }) {
    const q = new URLSearchParams({ page: String(p + 1), size: String(size), desc: 'true' });
    if (since) q.set('minModifiedAt', new Date(since).toISOString());
    const r = await hb(`${QNA}/issues?${q}`, { headers: qh() });
    const items = (g(r, 'data') || []).map((x) => {
      const conv = g(x, 'conversations') || [];
      const first = conv.find((c) => /customer/i.test(g(c, 'from') || '')) || {};
      const ans = conv.slice().reverse().find((c) => /merchant/i.test(g(c, 'from') || ''));
      const prod = g(x, 'product') || {}, subj = g(x, 'subject') || {};
      const st = g(x, 'status');
      return {
        remoteId: str(g(x, 'issueNumber') || g(x, 'id')), text: str(g(first, 'content') || g(x, 'lastContent')), askedAt: Date.parse(g(x, 'createdAt') || '') || Date.now(),
        status: QST[st] || 'other', remoteStatus: str(st), productName: [str(g(subj, 'description')), str(g(prod, 'name'))].filter(Boolean).join(' · '),
        productImage: str(g(prod, 'imageUrl')).replace('{size}', '300'), barcode: str(g(prod, 'sku')), sku: str(g(prod, 'stockCode')),
        customer: g(x, 'orderNumber') ? `Sipariş #${g(x, 'orderNumber')}` : '', answer: ans ? str(g(ans, 'content')) : null, answeredAt: ans ? Date.parse(g(ans, 'createdAt') || '') || null : null,
        dueAt: Date.parse(g(x, 'expireDate') || '') || null,
      };
    });
    return { items, total: num(g(r, 'totalItemCount')), hasNext: num(g(r, 'currentPage')) < num(g(r, 'totalPageCount')) };
  }
  // Cevap: multipart/form-data, alan adı "Answer" (en fazla 2000 karakter)
  async function answer(q, text) {
    const fd = new FormData();
    fd.append('Answer', text);
    const h = qh(); delete h['Content-Type'];
    await hb(`${QNA}/issues/${encodeURIComponent(q.remote_id)}/answer`, { method: 'POST', headers: h, body: fd });
  }

  // 520 incelemesi: aynı adres farklı başlık bileşimleriyle denenir; sonuçlar sorunun kaynağını gösterir
  async function probe(url) {
    const variants = [
      ['Yalnız kimlik + entegratör adı', { Authorization: basic(user, pass), 'User-Agent': env.HB_USER_AGENT || '' }],
      ['+ Accept: application/json', { Authorization: basic(user, pass), 'User-Agent': env.HB_USER_AGENT || '', Accept: 'application/json' }],
      ['+ Content-Type (eski biçim)', headers(true)],
    ];
    const rows = [];
    for (const [name, h] of variants) {
      try {
        const r = await fetch(url, { headers: h });
        const t = (await r.text()).slice(0, 120).replace(/\s+/g, ' ');
        rows.push(`${name}: HTTP ${r.status}${r.headers.get('cf-ray') ? ` · cf-ray ${r.headers.get('cf-ray')}` : ''}${r.headers.get('server') ? ` · ${r.headers.get('server')}` : ''}${t ? ` · ${t}` : ''}`);
      } catch (e) { rows.push(`${name}: bağlantı hatası (${e.message})`); }
    }
    return rows;
  }
  async function diagnose({ orderId } = {}) {
    const out = [];
    await diagStep(out, 'Sipariş servisi (paketlenecek satırlar)', async () => { const r = await call(`${OMS}/orders/merchantId/${m}?offset=0&limit=1`); return { detail: `erişildi · ${list(r).length ? 'açık satır var' : 'açık satır yok'} · merchant ${m}${test ? ' (TEST ortamı)' : ''}${proxy ? ` · aracı sunucu: ${new URL(proxy).host}` : ''}` }; });
    await diagStep(out, 'Paket servisi', async () => { const r = await call(`${OMS}/packages/merchantId/${m}?Offset=0&limit=1`); return { detail: `erişildi · ${page(r).length} paket örneği` }; });
    await diagStep(out, 'Kargodaki paketler', async () => { const r = await call(`${OMS}/packages/merchantId/${m}/shipped?offset=0&limit=1`); return { detail: `erişildi · toplam ${g(r, 'totalCount') ?? '?'}` }; });
    await diagStep(out, 'Ürün / listing servisi', async () => { const r = await call(`${LST}/listings/merchantid/${m}?offset=0&limit=1`); return { detail: `erişildi · ${r && (r.totalCount ?? r.total ?? list(r).length)} ilan` }; });
    if (questions) await diagStep(out, 'Müşteri soruları', async () => { const r = await questions({ page: 0, size: 1 }); return { detail: `${r.total ?? r.items.length} soru` }; });
    if (!proxy && out.some((x) => x.ok === false && /HTTP 52\d/.test(x.detail || ''))) {
      const rows = await probe(`${OMS}/orders/merchantId/${m}?offset=0&limit=1`);
      // Yol yazımı karşılaştırması: OpenAPI "merchantId"; eski sürümlerde "merchantid"
      try { const r = await fetch(`${OMS}/orders/merchantid/${m}?offset=0&limit=1`, { headers: headers(false) }); rows.push(`Eski yol (merchantid küçük harf): HTTP ${r.status}`); } catch (e) { rows.push(`Eski yol: bağlantı hatası (${e.message})`); }
      const any2xx = rows.some((r) => /HTTP 2\d\d/.test(r));
      out.push({ name: '520 incelemesi (sipariş servisi, farklı başlıklarla)', ok: any2xx ? null : false,
        detail: rows.join('\n') + (any2xx ? '\n→ Başlık farkı: başarılı olan biçim kullanılıyor.' : '\n→ Her biçimde 52x: Hepsiburada sunucusu, panelin çalıştığı Cloudflare sunucularından gelen isteği yanıtsız kapatıyor (başka ağlardan aynı servis cevap veriyor). Çözüm: kendi hostinginize panel adresi/hb-proxy.php dosyasını yükleyip Gelişmiş ayarlar → “Aracı sunucu adresi / anahtarı” alanlarını doldurun; istekler hostinginizin sabit IP\'sinden gider. Ayrıca Hepsiburada\'ya sorun: IP kısıtı veya hesap tanımı eksik mi?') });
    }
    if (orderId) await diagStep(out, 'Sipariş', async () => { const r = await call(`${OMS}/orders/merchantId/${m}/ordernumber/${encodeURIComponent(orderId)}`); return { detail: JSON.stringify(r).slice(0, 600) }; });
    return out;
  }

  // ---------- Katalog (ürün gönderme): mpop.hepsiburada.com/product ----------
  const CAT = `https://mpop${test}.hepsiburada.com/product`;
  let catCache = null;
  async function categories(q) {
    if (!catCache || Date.now() - catCache.at > 3600e3) {
      const all = [];
      for (let p = 0; p < 40; p++) {
        const r = await call(`${CAT}/api/categories/get-all-categories?leaf=true&status=ACTIVE&available=true&page=${p}&size=2000&version=1`);
        const rows = g(r, 'data') || (Array.isArray(r) ? r : []);
        all.push(...rows.map((c) => ({ id: str(g(c, 'categoryId', 'id')), name: str(g(c, 'name', 'displayName')), path: [].concat(g(c, 'paths') || []).join(' › ') })));
        const pages = num(g(r, 'totalPages'));
        if (rows.length < 2000 || (pages && p + 1 >= pages) || g(r, 'last') === true) break;
      }
      catCache = { at: Date.now(), all };
    }
    const k = String(q || '').toLocaleLowerCase('tr').trim();
    return { total: catCache.all.length, items: catCache.all.filter((c) => !k || `${c.name} ${c.path} ${c.id}`.toLocaleLowerCase('tr').includes(k)).slice(0, 60) };
  }
  async function attributes(catId) {
    const r = await call(`${CAT}/api/categories/${encodeURIComponent(catId)}/attributes`);
    const d = g(r, 'data') || r || {};
    const map = (list, kind) => (list || []).map((a) => ({ id: str(g(a, 'id')), name: str(g(a, 'name')), mandatory: !!g(a, 'mandatory'), type: str(g(a, 'type')), multi: !!g(a, 'multiValue'), kind }));
    return [...map(g(d, 'baseAttributes'), 'base'), ...map(g(d, 'attributes'), 'category'), ...map(g(d, 'variantAttributes'), 'variant')];
  }
  async function attributeValues(catId, attrId) {
    const r = await call(`${CAT}/api/categories/${encodeURIComponent(catId)}/attribute/${encodeURIComponent(attrId)}/values?page=0&size=1000`);
    return (g(r, 'data') || g(r, 'items') || (Array.isArray(r) ? r : [])).map((v) => ({ id: str(g(v, 'id')), value: str(g(v, 'value', 'name')) }));
  }
  // Ürün bilgisi gönderme: Hepsiburada ürün dizisini JSON dosyası olarak (multipart, alan adı "file") bekler; JSON gövdeyle gönderim
  // bazı ortamlarda HTTP 500 (internalServerError) döndürür. Sunucu dosyayı reddederse (415 / içerik türü) JSON gövdeyle denenir.
  // Tekrar denenmez (tries: 1): 5xx'te otomatik tekrar aynı ürünleri iki kez gönderebilir.
  async function importProducts(products) {
    const fd = new FormData();
    fd.append('file', new Blob([JSON.stringify(products)], { type: 'application/json' }), 'products.json');
    const h = headers(); delete h['Content-Type'];
    let r;
    try { r = await hb(`${CAT}/api/products/import`, { method: 'POST', headers: h, body: fd, tries: 1, timeout: 60000 }); }
    catch (e) {
      if (!/\b415\b|media type|content.?type|multipart/i.test(e.message)) throw e;
      r = await call(`${CAT}/api/products/import`, { method: 'POST', body: products, tries: 1, timeout: 60000 });
    }
    const tid = g(g(r, 'data') || {}, 'trackingId') || g(r, 'trackingId', 'id');
    if (!tid) throw new Error('Hepsiburada trackingId döndürmedi: ' + JSON.stringify(r).slice(0, 400));
    return { trackingId: str(tid), response: r };
  }
  const productStatus = (tid, pg = 0) => call(`${CAT}/api/products/status/${encodeURIComponent(tid)}?page=${pg}&size=100&version=1`);
  // Tek ilan için stok / fiyat yükleme: Hepsiburada yükleme kimliği döner, durumu ayrıca sorgulanır
  async function uploadOne(kind, rows) {
    const r = await call(`${LST}/listings/merchantid/${m}/${kind}-uploads`, { method: 'POST', body: rows });
    return { id: str(g(r, 'id')), response: r };
  }
  const uploadStatus = (kind, id) => call(`${LST}/listings/merchantid/${m}/${kind}-uploads/id/${encodeURIComponent(id)}`);
  async function createTestOrder(body) {
    if (!test) throw new Error('Test siparişi yalnızca test (SIT) ortamında oluşturulur: Entegrasyonlar → Hepsiburada → Ortam = Test');
    return hb(`https://oms-stub-external-sit.hepsiburada.com/orders/merchantId/${encodeURIComponent(m)}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  }
  // Test siparişinde kullanılacak kargo firması kimlikleri: paketli bir siparişin değiştirilebilir kargo firmaları (Id, ad, kısa ad)
  async function cargoCompanies(packageNumber) {
    const r = await call(`${OMS}/packages/merchantId/${m}/packagenumber/${encodeURIComponent(packageNumber)}/changablecargocompanies`);
    return page(r).map((c) => ({ id: num(g(c, 'id')) || null, name: str(g(c, 'name')), short: str(g(c, 'shortName')), active: g(c, 'isActive') !== false })).filter((c) => c.id || c.short);
  }
  const sit = { test: !!test, merchantId: m, categories, attributes, attributeValues, importProducts, productStatus, uploadOne, uploadStatus, createTestOrder, cargoCompanies };

  // ---------- Ürün yükleme (Ürün yükle ekranı): kategori eşleştirmesindeki değerlerle Hepsiburada ürün dosyası ----------
  // Panelin doldurduğu temel alanlar: satıcı SKU, varyant grubu, barkod, ad, açıklama, marka, KDV, fiyat, stok, görsel, desi
  const AUTO = ['merchantSku', 'VaryantGroupID', 'Barcode', 'UrunAdi', 'UrunAciklamasi', 'Marka', 'price', 'stock', 'Image1', 'tax_vat_rate', 'kg', 'GarantiSuresi'];
  const imageFor = (at, pr) => ((/arka|back/i.test(at.name) && (pr.images || [])[1]) || pr.image || '');
  const attrCache = new Map();
  const attrsOf = async (cat) => { if (!attrCache.has(cat)) attrCache.set(cat, await attributes(cat)); return attrCache.get(cat); };
  async function build(pr, map, { opts = {}, pick } = {}) {
    const a = {
      merchantSku: pr.sku, VaryantGroupID: pr.group, Barcode: pr.barcode, UrunAdi: pr.name, UrunAciklamasi: pr.description || pr.name, Marka: pr.brand,
      GarantiSuresi: String(opts.warranty ?? 0), kg: String(pr.desi || 1), tax_vat_rate: String(pr.vat ?? 20),
      price: String(pr.price).replace('.', ','), stock: String(pr.stock), Image1: pr.image,
    };
    (pr.images || []).slice(1, 5).forEach((u, i) => { a['Image' + (i + 2)] = u; });
    const missing = [];
    for (const at of await attrsOf(map.remote_id)) {
      if (AUTO.includes(at.id)) continue;
      const v = (map.attrs || {})[at.id];
      let val = v && (v.value ?? '');
      if (val === '@variant') { const hit = /enum|list|select/i.test(at.type) ? await pick(at, pr.variant) : null; val = hit ? hit.value : pr.variant; }
      // Görsel özellikleri (ör. "Paket Görseli (ön)"): ürün görselinden; "arka" için varsa ikinci görsel
      if (val === '@image' || (!val && isImageAttr(at))) val = imageFor(at, pr);
      if (val) a[at.id] = String(val);
      else if (at.mandatory) missing.push(at.name);
    }
    for (const [k, label] of [['merchantSku', 'SKU'], ['UrunAdi', 'ad'], ['Marka', 'marka'], ['Image1', 'görsel']]) if (!a[k]) missing.push(label);
    if (!(pr.price > 0)) missing.push('fiyat');
    return { key: pr.sku, missing, payload: { categoryId: Number(map.remote_id) || map.remote_id, merchant: m, attributes: a } };
  }
  async function send(payloads) {
    const out = [];
    for (const part of chunk(payloads, 100)) out.push((await importProducts(part)).trackingId); // istek başına en fazla 100 ürün
    return { ref: out.join(',') };
  }
  // Durum: her ürün için Hepsiburada'nın döndürdüğü durum ve doğrulama hataları
  // Hepsiburada ürün durumları: WAITING (işleniyor), PRE_MATCHED (ön eşleşme, onay bekliyor), MATCHED / MATCHED_WITH_STAGED /
  // CREATED (kataloğa alındı), MISSING_INFO (eksik bilgi) ve REJECTED (reddedildi) hatadır.
  const HB_WAIT = /^(WAITING|PRE_MATCHED|IN_PROGRESS|PROCESSING|PENDING)$/i, HB_BAD = /^(MISSING_INFO|REJECTED|FAILED|ERROR)$/i;
  const HB_ST_TR = { WAITING: 'işleniyor', PRE_MATCHED: 'ön eşleşme · onay bekliyor', MATCHED: 'katalogdaki ürünle eşleşti', MATCHED_WITH_STAGED: 'eşleşti', CREATED: 'ürün oluşturuldu', MISSING_INFO: 'eksik bilgi', REJECTED: 'reddedildi' };
  // Hata nedenleri: Hepsiburada nedeni farklı alanlarda döndürebilir (validationResults, failureReasons, importMessages, errors,
  // message …); ürün kaydının her yerindeki ileti / neden metinleri toplanır (durum ve kimlik alanları hariç).
  function reasons(it) {
    const out = [];
    const walk = (v, key = '', attr = '', depth = 0) => {
      if (v == null || depth > 5 || out.length >= 8) return;
      if (typeof v === 'string') {
        if (/message|reason|description|error|hata|aciklama|detail/i.test(key) && v.trim() && !/^(true|false|null|ok|success)$/i.test(v.trim())) {
          const t = (attr ? `${attr}: ` : '') + v.trim();
          if (!out.includes(t)) out.push(t);
        }
        return;
      }
      if (Array.isArray(v)) { v.forEach((x) => walk(x, key, attr, depth + 1)); return; }
      if (typeof v === 'object') {
        const a = str(v.attributeName || v.attribute || v.field || v.fieldName || attr);
        for (const [k, x] of Object.entries(v)) if (!/^(productStatus|status|importStatus|merchantSku|merchant|sku|hbSku|barcode|trackingId|id)$/i.test(k)) walk(x, k, a, depth + 1);
      }
    };
    walk(it);
    return out;
  }
  async function status(ref) {
    const items = [];
    let pending = false;
    for (const tid of String(ref).split(',').filter(Boolean)) {
      let got = 0;
      for (let pg = 0; pg < 10; pg++) {
        const r = await productStatus(tid, pg);
        const rows = page(g(r, 'data') && !Array.isArray(g(r, 'data')) ? g(g(r, 'data'), 'items', 'data') || [] : r);
        got += rows.length;
        for (const it of rows) {
          const st = str(g(it, 'productStatus', 'status', 'importStatus'));
          const errs = reasons(it);
          const wait = (HB_WAIT.test(st) || /wait|progress|pending|beklen|process/i.test(st)) && !errs.length;
          if (wait) pending = true;
          const bad = !wait && (errs.length > 0 || HB_BAD.test(st) || /fail|error|reject|missing|hata|red/i.test(st));
          items.push({ key: str(g(it, 'merchantSku', 'sku')), status: HB_ST_TR[st.toUpperCase()] || st, ok: wait ? null : !bad, error: errs.join(' · ') || (bad ? HB_ST_TR[st.toUpperCase()] || st : '') });
        }
        const total = Number(g(r, 'totalElements', 'totalCount')) || 0;
        if (rows.length < 100 || (total && got >= total)) break;
      }
      if (!got) pending = true;
    }
    return { done: !pending, items };
  }
  const allCategories = async () => { await categories(''); return catCache.all; };
  const catalog = { categories, allCategories, attributes: async (c) => (await attrsOf(c)).filter((a) => !AUTO.includes(a.id)), values: attributeValues, build, send, status, raw: (tid) => productStatus(tid), chunk: 100, options: [{ k: 'warranty', label: 'Garanti süresi (ay)' }] };

  // ---------- kargo gideri (gerçek) ----------
  // Kayıt bazlı muhasebe servisi (mpfinance): sipariş tarihine göre en fazla 1 aylık aralıkla işlemler okunur; türü / açıklaması
  // kargo olan kayıtlar sipariş numarasına göre toplanır.
  const FIN = `https://mpfinance-external${test}.hepsiburada.com`;
  async function cargoCosts(since, until) {
    const W = 28 * 864e5, byOrder = new Map();
    const d = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);
    for (let from = since; from < until; from += W) {
      const to = Math.min(until, from + W);
      for (let off = 0; off < 20000; off += 100) {
        const r = await call(`${FIN}/transactions/merchantid/${m}?Offset=${off}&Limit=100&OrderDateStart=${d(from)}&OrderDateEnd=${d(to)}`);
        const rows = list(r);
        for (const x of rows) {
          const t = `${g(x, 'type', 'transactionType') || ''} ${g(x, 'description', 'transactionDescription') || ''}`;
          const no = str(g(x, 'orderNumber'));
          if (no && /kargo|cargo|shipping|shipment|transport|delivery|teslimat/i.test(t) && !/refund/i.test(t)) byOrder.set(no, (byOrder.get(no) || 0) + Math.abs(money(g(x, 'amount'))));
        }
        if (rows.length < 100) break;
      }
    }
    return { items: [...byOrder].map(([orderNumber, amount]) => ({ orderNumber, amount: Math.round(amount * 100) / 100 })) };
  }

  // ---------- iade talepleri (claims): oms-external /claims ----------
  // Her talep tek ürün (SKU) satırıdır; talep numarası (number) ile onaylanır / reddedilir. "AwaitingAction" talepler karar bekler.
  const HCS = { AwaitingAction: 'waiting', Accepted: 'accepted', Refunded: 'accepted', Rejected: 'rejected', NewRequest: 'other', InDispute: 'other', Cancelled: 'other', AwaitingPreApproval: 'other' };
  const HCS_TR = { AwaitingAction: 'Aksiyon bekliyor', Accepted: 'Onaylandı', Refunded: 'İade edildi', Rejected: 'Reddedildi', NewRequest: 'Yeni talep (ürün yolda)', InDispute: 'İtirazda', Cancelled: 'İptal', AwaitingPreApproval: 'Ön onay bekliyor' };
  const hbDate = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
  async function claims({ since, until = Date.now(), page: p = 0, size = 100 }) {
    const lim = Math.min(100, size);
    const rows = list(await call(`${OMS}/claims/merchantId/${m}?beginDate=${encodeURIComponent(hbDate(since))}&endDate=${encodeURIComponent(hbDate(until))}&offset=${p * lim}&limit=${lim}`));
    const items = rows.map((c) => {
      const st = str(g(c, 'status')), qty = num(g(c, 'quantity'), 1), price = money(g(c, 'priceAmount'));
      const no = str(g(c, 'number', 'claimNumber'));
      return {
        remoteId: no || str(g(c, 'id')), orderNumber: str(g(c, 'orderNumber')), claimedAt: Date.parse(g(c, 'claimDate') || '') || Date.now(), status: HCS[st] || 'other', remoteStatus: HCS_TR[st] || st,
        customer: str(g(c, 'customerName')), reason: str(g(c, 'claimType')), note: str(g(c, 'explanation')),
        lines: [{ id: no, name: str(g(c, 'productName')) || str(g(c, 'sku')), sku: str(g(c, 'sku')), qty, price, reason: str(g(c, 'claimType')), note: str(g(c, 'explanation')), status: HCS[st] || 'other', remoteStatus: HCS_TR[st] || st }],
        amount: money(g(c, 'totalPriceAmount')) || price * qty, cargo: '', tracking: '',
      };
    });
    return { items, hasNext: rows.length >= lim };
  }
  const HB_REASONS = [['BoxIsEmpty', 'Koli boş geldi'], ['WrongProduct', 'Yanlış ürün gönderilmiş'], ['ProductIsDamaged', 'Ürün hasarlı'], ['NoSuchAccessory', 'Aksesuar eksik'],
    ['ItHasBeenSentWithOtherProducts', 'Başka ürünlerle gönderilmiş'], ['ThereIsNoCargoReport', 'Kargo hasar tutanağı yok'], ['CustomerReturnedWrongItem', 'Müşteri farklı ürün göndermiş'],
    ['CustomerPackageIsNotInTheConditionISent', 'Paket gönderdiğim gibi değil'], ['ProductHasBeenUsed', 'Ürün kullanılmış'], ['ProductIsNotInSellableCondition', 'Ürün satılabilir durumda değil'],
    ['MissingInvoice', 'Fatura eksik'], ['SomePartsOrSomeAccessoriesOrSomePapersAreMissing', 'Parça / aksesuar / belge eksik']];
  const claimReasons = async () => HB_REASONS.map(([id, name]) => ({ id, name }));
  async function approveClaim(c) { await call(`${OMS}/claims/number/${encodeURIComponent(c.remote_id)}/accept`, { method: 'POST', body: {} }); }
  async function rejectClaim(c, lines, { reasonId, text }) {
    await call(`${OMS}/claims/number/${encodeURIComponent(c.remote_id)}/reject`, { method: 'POST', body: { ClaimRejectionReason: reasonId, MerchantStatement: String(text).slice(0, 1000), Reports: [], UploadedReportsUrls: [] } });
  }

  // ---------- hakediş (mpfinance işlemleri): ödenecek (WillBePaid) ve ödenen (Paid) kayıtlar ----------
  // Gelir kayıtları (+), gider kayıtları (−); vade tarihi (dueDate) ödeme günüdür. Kayıt tarihine göre en fazla 1 aylık aralıklarla.
  const HB_TR = { Payment: 'Satış', Return: 'İade', CampaignDiscount: 'Kampanya indirimi', Commission: 'Komisyon', Stoppage: 'Stopaj' };
  async function settlements(since, until) {
    const W = 28 * 864e5, d = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10), out = new Map();
    for (let from = since; from < until; from += W) {
      const to = Math.min(until, from + W);
      for (let off = 0; off < 100000; off += 100) {
        const rows = list(await call(`${FIN}/transactions/merchantid/${m}?Offset=${off}&Limit=100&Status=Paid,WillBePaid&RecordDateStart=${d(from)}&RecordDateEnd=${d(to)}`));
        for (const x of rows) {
          const tt = str(g(x, 'transactionType'));
          if (/^TotalPayment$/.test(tt)) continue; // toplam ödeme satırı ayrı kalemleri tekrar eder
          const v = Math.abs(money(g(x, 'netAmount')) || money(g(x, 'amount'))), inc = g(x, 'isIncome');
          const amount = (inc === true || (inc == null && money(g(x, 'amount')) > 0) ? 1 : -1) * v;
          const due = Date.parse(g(x, 'dueDate') || '') || null, paidAt = Date.parse(g(x, 'paymentDate') || '') || null;
          out.set(str(g(x, 'id')), { remoteId: str(g(x, 'id')), date: Date.parse(g(x, 'orderDate') || g(x, 'invoiceDate') || '') || from, type: HB_TR[tt] || hbType[tt] || tt, orderNumber: str(g(x, 'orderNumber')),
            amount: Math.round(amount * 100) / 100, commission: /^Commission/.test(tt) ? Math.round(amount * 100) / 100 : 0, paymentDate: paidAt, dueDate: due || paidAt, paid: /^Paid$/i.test(str(g(x, 'status'))), paymentId: '' });
        }
        if (rows.length < 100) break;
      }
    }
    return [...out.values()];
  }

  // ---------- kampanyalar: satıcı sepet indirimleri (diskonto-external /self-campaign) ----------
  // Yüzde indirim, TL indirim (bütçeli) ve X al Y öde; tüm ürünlerde, kategorilerde ya da SKU listesinde. Bütçe ve tutar sınırları servisten gelir.
  const DSK = `https://diskonto-external${test}.hepsiburada.com`;
  const dsk = async (path, opts) => { const r = await call(DSK + path, opts); if (r && r.success === false) throw new Error('Hepsiburada: ' + [].concat(r.errors || r.message || 'işlem başarısız').join(', ')); return r && r.data !== undefined ? r.data : r; };
  const campaigns = {
    async list(page = 1, size = 50) { const d = await dsk(`/self-campaign/${m}/discounts?page=${page}&pagesize=${size}`); return { total: num(d && d.totalCount), items: (d && d.items) || [] }; },
    detail: (id) => dsk(`/self-campaign/${m}/discount/${encodeURIComponent(id)}`),
    budgets: () => dsk(`/self-campaign/${m}/budgets`),
    limits: () => dsk(`/self-campaign/${m}/limits`),
    categories: () => dsk(`/categories/${m}`),
    async create(kind, b) {
      const path = { percent: 'percent-discount', tl: 'tl-discount', xy: 'xy-discount' }[kind];
      if (!path) throw new Error('Bilinmeyen kampanya türü');
      return dsk(`/self-campaign/${m}/${path}`, { method: 'POST', body: b });
    },
    cancel: (id) => dsk(`/self-campaign/${m}/cancel-discount`, { method: 'POST', body: { campaignId: Number(id) || id } }),
  };

  // ---------- kesilen faturalar / kesintiler (mpfinance işlemleri) ----------
  // Gider türündeki işlemler fatura numarasına göre birleştirilir (aynı faturanın satırları tek kayıt). İade (…Refund) eksi tutarla.
  // Servis tarih aralığını en fazla 1 ay kabul eder; PDF bağlantısı vermez.
  const HB_TYPES = {
    Komisyon: ['Commission', 'CommissionCorrection', 'CommissionRefund', 'CommissionInvoiceRefund'],
    Stopaj: ['Stoppage', 'StoppageRefund'],
    'Reklam / pazarlama': ['MarketingExpense', 'AdSharingExpense', 'FacebookAdExpense', 'SponsorshipFee', 'StudioExpense'],
    Kargo: ['ShipmentCostSharingExpense', 'ReturnShipmentCostSharingExpense', 'TransportExpense', 'CargoMargin', 'DeliveryProcessingFee'],
    'Hizmet bedeli': ['ProcessingFeeExpense', 'PaymentServiceCostReflection', 'InternationalOperationFee'],
    Ceza: ['LateInterestExpense', 'PriceDifferenceExpense', 'RefusedInvoiceExpense'],
  };
  const hbType = Object.fromEntries(Object.entries(HB_TYPES).flatMap(([k, list]) => list.map((t) => [t, k])));
  async function invoices(since, until) {
    const W = 28 * 864e5, d = (ms) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10), by = new Map();
    const types = Object.keys(hbType).join(',');
    for (let from = since; from < until; from += W) {
      const to = Math.min(until, from + W);
      for (let off = 0; off < 50000; off += 100) {
        const rows = list(await call(`${FIN}/transactions/merchantid/${m}?Offset=${off}&Limit=100&TransactionTypes=${types}&RecordDateStart=${d(from)}&RecordDateEnd=${d(to)}`));
        for (const x of rows) {
          const tt = str(g(x, 'transactionType')), type = hbType[tt] || 'Diğer kesinti';
          const inv = str(g(x, 'invoiceNumber')), key = inv ? `${type}:${inv}` : `${tt}:${str(g(x, 'id'))}`;
          const amt = Math.abs(money(g(x, 'amount'))) * (/Refund/.test(tt) ? -1 : 1);
          const date = Date.parse(g(x, 'invoiceDate') || g(x, 'orderDate') || '') || from;
          const e = by.get(key) || { remoteId: key, no: inv, date, type, description: str(g(x, 'invoiceExplanation')) || tt, amount: 0, orderNumber: inv ? '' : str(g(x, 'orderNumber')), url: '' };
          e.amount = Math.round((e.amount + amt) * 100) / 100;
          by.set(key, e);
        }
        if (rows.length < 100) break;
      }
    }
    return [...by.values()].filter((x) => x.amount);
  }

  const missing = ['HB_MERCHANT_ID', 'HB_PASSWORD', 'HB_USER_AGENT'].filter((k) => !env[k]);
  return {
    ...meta, type: 'hepsiburada', enabled: !missing.length, missing, sandbox: !!test,
    caps: { accept: 'local', split: 'remote', pack: 'remote', ship: 'local', label: 'remote', cargo: 'change', cancelPackage: true, createProduct: false, price: true, answer: { min: 2, max: 2000 } },
    fetchOrders, fetchListings, pushStock, pushPrice, split, label, pack, cargoOptions, changeCargo, cancelPackage, buybox, diagnose, questions, answer, sit, catalog, cargoCosts, invoices, settlements, claims, claimReasons, approveClaim, rejectClaim, campaigns,
  };
}
