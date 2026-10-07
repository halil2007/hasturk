// N11 (yeni REST API, api.n11.com). Satıcı Ofisi → Hesabım → API Hesapları: appkey + appsecret (her istekte başlıkta).
// Siparişler paket (shipmentPackage) düzeyinde gelir, aynı sipariş numarasındakiler birleştirilir. En fazla 15 günlük aralık.
// Kargo: N11 anlaşmalı kargo; durum kargo okutunca kendiliğinden "Shipped" olur (API'de kargoya verme / etiket servisi yok).
// Ürün yükleme REST (cdn/categories, ms/product/tasks); iade talepleri SOAP (ws/returnService). Hakediş / fatura (finans) servisi yok.
// Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür.
import { http, num, str, chunk, imageList, DEAD_LINE } from '../util.js';

const BASE = 'https://api.n11.com';
const STATUS = { created: 'new', picking: 'processing', unpacked: 'processing', shipped: 'shipped', delivered: 'delivered', cancelled: 'cancelled', unsupplied: 'cancelled', returned: 'returned' };
const RANKS = ['new', 'processing', 'shipped', 'delivered'];
// Paket durumu → panel durumu. Belgede "Unpacked", eski kodda "UnPacked": büyük / küçük harf ve boşluk fark etmez
const pst = (p) => STATUS[String((p && p.shipmentPackageStatus) || '').trim().toLowerCase()];
// Bölünen paket (Unpacked): yerine aynı sipariş numarasıyla yeni paketler oluşur; ürünleri ve tutarı yeni paketlerde tekrar gelir
const isSplit = (p) => /^unpacked$/i.test(String((p && p.shipmentPackageStatus) || '').trim());
const money2 = (v) => Math.round(num(v) * 100) / 100;

export function n11(env, meta) {
  const key = env.N11_APP_KEY, secret = env.N11_APP_SECRET;
  const call = (path, opts = {}) => http(BASE + path, { ...opts, headers: { appkey: key, appsecret: secret, 'Content-Type': 'application/json', Accept: 'application/json' }, body: opts.body && JSON.stringify(opts.body) });

  function group(pkgs) {
    const by = new Map();
    for (const p of pkgs) { const k = String(p.orderNumber); by.set(k, [...(by.get(k) || []), p]); }
    return [...by.values()].map((all) => {
      // Aynı paket iki sayfada / iki aralıkta gelebilir: paket numarasına göre tekilleştir (numarasız paket: konuma özel teslimat)
      const uniq = [...new Map(all.map((p, i) => [p.id != null && p.id !== '' ? String(p.id) : `#${i}`, p])).values()];
      // Bölünüp yerine yenileri gelen paketler sayılmaz (ürünler ve tutar iki kez sayılmasın; durum yeni paketlerden)
      const list = uniq.some((p) => !isSplit(p)) ? uniq.filter((p) => !isSplit(p)) : uniq;
      const p0 = list[0], a = p0.shippingAddress || {};
      const dead = (p) => ['cancelled', 'returned'].includes(pst(p));
      const items = [];
      // Canlı paketlerin satırları önce: aynı satır hem iptal hem canlı pakette görünürse canlı olan geçerli
      for (const p of [...list.filter((x) => !dead(x)), ...list.filter(dead)]) for (const l of p.lines || []) {
        if (items.some((i) => i.lineId === String(l.orderLineId))) continue;
        // Satır tutarı: satıcının faturalayacağı tutar (sellerInvoiceAmount = fiyat × adet − mağaza indirimleri; n11 indirimi n11'den)
        const qty = num(l.quantity, 1), unit = num(l.price), total = num(l.sellerInvoiceAmount) || num(l.dueAmount) || unit * qty;
        items.push({ lineId: String(l.orderLineId), sku: str(l.stockCode), barcode: str(l.barcode), name: str(l.productName), image: '', quantity: qty, unitPrice: qty ? total / qty : unit, total,
          status: dead(p) ? pst(p) : '', remoteKey: str(l.stockCode) });
      }
      const live = list.filter((p) => !dead(p));
      const status = !live.length ? (list.some((p) => pst(p) === 'returned') ? 'returned' : 'cancelled')
        : RANKS[Math.min(...live.map((p) => Math.max(0, RANKS.indexOf(pst(p) || 'new'))))];
      const hist = uniq.flatMap((p) => (p.packageHistories || []).map((h) => num(h.createdDate))).filter(Boolean);
      const tracked = live.find((p) => p.cargoTrackingNumber) || list.find((p) => p.cargoTrackingNumber) || {};
      const sumOf = (ps) => ps.reduce((s, p) => s + num(p.totalAmount), 0);
      return {
        remoteId: String(p0.orderNumber), orderNumber: String(p0.orderNumber), orderedAt: hist.length ? Math.min(...hist) : num(p0.lastModifiedDate) || Date.now(),
        remoteStatus: list.map((p) => str(p.shipmentPackageStatus)).join(', '), status,
        customer: str(p0.customerfullName || a.fullName), phone: str(a.gsm), email: str(p0.customerEmail), customerId: str(p0.customerId || p0.buyerId),
        address: { name: str(a.fullName || p0.customerfullName), line: str(a.address), district: str(a.district), city: str(a.city), phone: str(a.gsm) },
        total: Math.round((live.length ? sumOf(live) : sumOf(list)) * 100) / 100, currency: 'TRY',
        cargoCompany: str(tracked.cargoProviderName), tracking: str(tracked.cargoTrackingNumber),
        shipBy: Math.min(...live.map((p) => num(p.agreedDeliveryDate)).filter((x) => x > 0)) || null,
        items,
        // Paket numarası (id) olmayan paket (konuma özel teslimat; kargosu satıcıda) panelde kanal paketi olarak tutulmaz
        packages: list.filter((p) => pst(p) !== 'cancelled' && p.id != null && p.id !== '').map((p) => ({
          remoteId: String(p.id), items: (p.lines || []).map((l) => ({ line_id: String(l.orderLineId), qty: num(l.quantity, 1) })),
          status: ['shipped', 'delivered'].includes(pst(p)) ? 'shipped' : 'open', remoteStatus: str(p.shipmentPackageStatus),
          cargoCompany: str(p.cargoProviderName), tracking: str(p.cargoTrackingNumber), barcode: str(p.cargoSenderNumber),
        })),
      };
    });
  }

  // Siparişler sipariş oluşturma tarihine göre (orderByField gönderilmez): bir siparişin TÜM paketleri birlikte gelir. Güncellenme
  // tarihine göre sorguda yalnız değişen paket gelir ve diğer paketlerin satırları siparişten düşerdi. Aralık en fazla 15 gün, sayfa en çok 100.
  async function fetchOrders(since, until) {
    const W = 15 * 864e5 - 60e3, pkgs = [];
    for (let to = until; to > since; to -= W) {
      const from = Math.max(since, to - W);
      for (let page = 0; page < 50; page++) {
        const r = await call(`/rest/delivery/v1/shipmentPackages?startDate=${from}&endDate=${to}&page=${page}&size=100`);
        pkgs.push(...(r.content || []));
        if (page + 1 >= (r.totalPages || 1)) break;
      }
    }
    return group(pkgs);
  }

  async function fetchListings() {
    const out = [];
    for (let page = 0; page < 400; page++) {
      const r = await call(`/ms/product-query?page=${page}&size=250`);
      for (const p of r.content || []) {
        out.push({ remoteId: str(p.stockCode), remoteProductId: str(p.n11ProductId || p.productMainId), sku: str(p.stockCode), barcode: str(p.barcode), name: str(p.title), groupName: str(p.title), variantName: '',
          image: str((p.imageUrls || [])[0] || ((p.images || [])[0] || {}).url), images: imageList(p.imageUrls || p.images), price: num(p.salePrice), listPrice: num(p.listPrice), stock: num(p.quantity), active: p.status !== 'Suspended' });
      }
      if (r.last || page + 1 >= (r.totalPages || 1)) break;
    }
    return out;
  }

  // Fiyat / stok: price-stock-update görevi (en fazla 1000 SKU). Görev kuyruğa alınır (IN_QUEUE) ya da hiç işlenmez (REJECT → hata).
  // Sonuç SKU bazında task-details ile sorgulanır (pushStatus): FAIL olan ilan panelde hata olarak görünür.
  // Fiyatlar noktadan sonra en fazla 2 hane olmalı (aksi FAIL), listPrice satış fiyatından düşük olamaz; stok tam sayı.
  async function task(skus) {
    const refs = [];
    for (const part of chunk(skus, 1000)) {
      const r = await call('/ms/product/tasks/price-stock-update', { method: 'POST', body: { payload: { integrator: 'HasturkPanel', skus: part } } });
      if (r && (/^REJECT$/i.test(str(r.status)) || !r.id)) throw new Error('N11 fiyat / stok görevi reddedildi: ' + (((r && r.reasons) || []).join(' · ') || JSON.stringify(r).slice(0, 300)));
      refs.push(String(r.id));
    }
    return { refs };
  }
  const pushStock = (items) => task(items.map((x) => ({ stockCode: x.remoteId, quantity: Math.max(0, Math.round(num(x.stock))) })));
  const pushPrice = (items) => task(items.map((x) => { const sale = money2(x.price); return { stockCode: x.remoteId, salePrice: sale, listPrice: Math.max(money2(x.listPrice), sale), currencyType: 'TL' }; }));

  // İşleme al: "Picking" (yalnızca Created satırlar). Servis satır satır sonuç verir; hiçbir satır onaylanmadıysa hata.
  async function accept(order) {
    const lines = order.items.filter((i) => !DEAD_LINE(i.status)).map((i) => ({ lineId: Number(i.line_id) || i.line_id }));
    if (!lines.length) return;
    const r = await call('/rest/order/v1/update', { method: 'PUT', body: { lines, status: 'Picking' } });
    const res = (r && Array.isArray(r.content) && r.content) || [];
    const bad = res.filter((x) => !/^SUCCESS$/i.test(str(x.status)));
    if (res.length && bad.length === res.length) throw new Error('N11 siparişi onaylamadı: ' + bad.map((x) => `${x.lineId}: ${str(x.reasons) || str(x.status)}`).join(' · ').slice(0, 400));
  }

  // ---------- müşteri soruları (ürün soru-cevap, SOAP: api.n11.com/ws/productService) ----------
  // Liste servisi dakikada bir kez çağrılabilir: her senkronda açık (cevap bekleyen) sorular tek sayfada (100) alınır.
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tag = (x, t) => { const m = new RegExp(`<(?:\\w+:)?${t}>([\\s\\S]*?)</(?:\\w+:)?${t}>`).exec(x); return m ? m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim() : ''; };
  const tags = (x, t) => [...x.matchAll(new RegExp(`<(?:\\w+:)?${t}>([\\s\\S]*?)</(?:\\w+:)?${t}>`, 'g'))].map((m) => m[1]);
  async function soap(op, inner, svc = 'productService') {
    const body = `<?xml version="1.0" encoding="utf-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sch="http://www.n11.com/ws/schemas"><soapenv:Header/><soapenv:Body>`
      + `<sch:${op}Request><auth><appKey>${esc(key)}</appKey><appSecret>${esc(secret)}</appSecret></auth>${inner}</sch:${op}Request></soapenv:Body></soapenv:Envelope>`;
    const res = await fetch(`${BASE}/ws/${svc}/`, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: op }, body });
    const x = await res.text();
    const fault = tag(x, 'faultstring');
    if (!res.ok || fault) throw new Error(`N11 ${op}: HTTP ${res.status} ${fault || x.slice(0, 200)}`);
    if (/^failure$/i.test(tag(tag(x, 'result') || x, 'status'))) throw new Error(`N11 ${op}: ${tag(x, 'errorMessage') || 'başarısız'}`);
    return x;
  }
  const dmy = (ms) => { const d = new Date(ms + 3 * 3600e3); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };
  async function questions({ since, until = Date.now(), page = 0 }) {
    if (page > 0) return { items: [], hasNext: false };
    const x = await soap('GetProductQuestionList', `<productQuestionSearch><productId></productId><buyerEmail></buyerEmail><subject></subject><status>OPEN</status><startDate>${dmy(since)}</startDate><endDate>${dmy(until)}</endDate></productQuestionSearch><pagingData><currentPage>0</currentPage><pageSize>100</pageSize></pagingData>`);
    const items = tags(x, 'productQuestion').map((q) => ({
      remoteId: tag(q, 'id'), text: [tag(q, 'questionSubject'), tag(q, 'question')].filter(Boolean).join(' — '), status: tag(q, 'answer') ? 'answered' : 'waiting', remoteStatus: tag(q, 'answer') ? 'CLOSED' : 'OPEN',
      productName: tag(q, 'productTitle'), sku: tag(q, 'productId'), answer: tag(q, 'answer') || null,
    })).filter((q) => q.remoteId);
    return { items, hasNext: false, total: Number(tag(x, 'totalCount')) || items.length };
  }
  async function answer(q, text) {
    await soap('SaveProductAnswer', `<productQuestionId>${esc(q.remote_id)}</productQuestionId><answer>${esc(text)}</answer>`);
  }

  // ---------- Ürün yükleme (Ürün yükle ekranı) ----------
  // Kategori ağacı: /cdn/categories · özellikler (değerleriyle): /cdn/category/{id}/attribute · ürün oluşturma: /ms/product/tasks/product-create
  // (en fazla 1000 SKU, taskId döner) · sonuç: /ms/product/task-details/page-query (itemCode = stockCode, SUCCESS / FAIL).
  // Marka da bir kategori özelliğidir ("Marka"): eşleştirmede istenmez, ürünün markasından doldurulur.
  let catCache = null;
  async function categories(q) {
    if (!catCache || Date.now() - catCache.at > 6 * 3600e3) {
      const all = [];
      const walk = (list, path) => { for (const c of list || []) { const p = path.concat(c.name); if ((c.subCategories || []).length) walk(c.subCategories, p); else all.push({ id: String(c.id), name: str(c.name), path: path.join(' › ') }); } };
      walk((await call('/cdn/categories')).categories, []);
      catCache = { at: Date.now(), all };
    }
    const k = String(q || '').toLocaleLowerCase('tr').trim();
    return { total: catCache.all.length, items: catCache.all.filter((c) => !k || `${c.name} ${c.path} ${c.id}`.toLocaleLowerCase('tr').includes(k)).slice(0, 60) };
  }
  const attrCache = new Map();
  async function rawAttrs(cat) {
    if (!attrCache.has(cat)) attrCache.set(cat, (await call(`/cdn/category/${encodeURIComponent(cat)}/attribute`)).categoryAttributes || []);
    return attrCache.get(cat);
  }
  const isBrand = (a) => /^marka$/i.test(str(a.attributeName));
  const attributes = async (cat) => (await rawAttrs(cat)).filter((a) => !isBrand(a)).map((a) => ({ id: String(a.attributeId), name: str(a.attributeName), mandatory: !!a.isMandatory,
    kind: a.isVariant ? 'variant' : 'category', type: a.isCustomValue && !(a.attributeValues || []).length ? 'text' : 'enum', custom: !!a.isCustomValue, multi: false }));
  async function values(cat, attr) {
    const a = (await rawAttrs(cat)).find((x) => String(x.attributeId) === String(attr));
    return ((a && a.attributeValues) || []).map((v) => ({ id: String(v.id), value: str(v.value) }));
  }
  const lc = (v) => str(v).toLocaleLowerCase('tr');
  async function build(pr, map, { opts = {}, pick } = {}) {
    const missing = [], attrs = [];
    for (const a of await rawAttrs(map.remote_id)) {
      const id = String(a.attributeId), v = (map.attrs || {})[id];
      let valueId = v && v.id, text = v && v.value;
      if (!v && isBrand(a)) text = pr.brand;
      if (text === '@variant') { const hit = pr.variant ? await pick({ id }, pr.variant) : null; valueId = hit && hit.id; text = hit ? '' : pr.variant; }
      if (text === '@image') text = pr.image;
      // Listede olan değer valueId ile; listede yoksa yalnız serbest değere izin veren (isCustomValue) özellikte customValue ile
      if (!valueId && text) valueId = ((a.attributeValues || []).find((x) => lc(x.value) === lc(text)) || {}).id;
      if (valueId) attrs.push({ id: Number(id), valueId: Number(valueId), customValue: null });
      else if (text && a.isCustomValue) attrs.push({ id: Number(id), valueId: null, customValue: String(text) });
      else if (a.isMandatory) missing.push(isBrand(a) && !text ? 'marka' : str(a.attributeName) + (text ? ` (“${text}” listede yok)` : ''));
    }
    const images = [pr.image, ...(pr.images || [])].filter((u, i, l) => /^https:\/\//i.test(u) && l.indexOf(u) === i);
    if (!pr.sku) missing.push('SKU');
    if (!images.length) missing.push('görsel (https)');
    if (!(pr.price > 0)) missing.push('fiyat');
    if (![0, 1, 10, 20].includes(Number(pr.vat ?? 20))) missing.push(`KDV oranı %${pr.vat} (N11: 0, 1, 10, 20)`);
    if (!str(opts.shipmentTemplate)) missing.push('kargo şablonu (Ürün yükle → N11 seçenekleri)');
    if (!(num(opts.preparingDay) > 0)) missing.push('kargoya veriliş süresi (Ürün yükle → N11 seçenekleri)');
    const item = {
      title: str(pr.name), description: pr.description || pr.name, categoryId: Number(map.remote_id), currencyType: 'TL', productMainId: str(pr.group || pr.sku),
      preparingDay: Math.round(num(opts.preparingDay)), shipmentTemplate: str(opts.shipmentTemplate), stockCode: pr.sku, barcode: pr.barcode || null,
      quantity: Math.min(999999, Math.max(0, Math.round(num(pr.stock)))), images: images.map((url, order) => ({ url, order })), attributes: attrs,
      salePrice: pr.price, listPrice: Math.max(pr.listPrice || 0, pr.price), vatRate: Number(pr.vat ?? 20),
    };
    return { key: pr.sku, missing, payload: item };
  }
  async function send(items) {
    const refs = [];
    for (const part of chunk(items, 1000)) {
      const r = await call('/ms/product/tasks/product-create', { method: 'POST', body: { payload: { integrator: 'HasturkPanel', skus: part } }, tries: 1 });
      if (r.status === 'REJECT' || !r.id) throw new Error('N11 görevi reddetti: ' + ((r.reasons || []).join(' · ') || JSON.stringify(r).slice(0, 300)));
      refs.push(r.id);
    }
    return { ref: refs.join(',') };
  }
  // Görev durumu: PROCESSED tamamlandı, IN_QUEUE işleniyor, REJECT işlenmedi. Ürün sonucu: SUCCESS / FAIL (nedeni reasons).
  async function status(ref) {
    const items = [];
    let pending = false;
    for (const id of String(ref).split(',').filter(Boolean)) {
      for (let page = 0; page < 20; page++) {
        const r = await call('/ms/product/task-details/page-query', { method: 'POST', body: { taskId: Number(id), pageable: { page, size: 1000 } } });
        if (!/^(PROCESSED|REJECT)$/i.test(str(r.status))) pending = true;
        const sk = r.skus || {};
        for (const it of sk.content || []) {
          const st = str(it.status);
          items.push({ key: str(it.itemCode), status: st, ok: /^SUCCESS$/i.test(st) ? true : /^FAIL/i.test(st) ? false : null, error: /^FAIL/i.test(st) ? (it.reasons || []).join(' · ') : '' });
        }
        if (sk.last !== false || page + 1 >= num(sk.totalPages, 1)) break;
      }
    }
    return { done: !pending, items };
  }
  const allCategories = async () => { await categories(''); return catCache.all; };
  const catalog = { categories, allCategories, attributes, values, build, send, status, chunk: 1000,
    options: [{ k: 'shipmentTemplate', label: 'Kargo şablonu adı (N11 → Hesabım → Teslimat Bilgilerim)' }, { k: 'preparingDay', label: 'Kargoya veriliş süresi (gün)' }] };

  // ---------- iade talepleri (SOAP: api.n11.com/ws/returnService, ReturnService.wsdl) ----------
  // Her talep tek ürün satırıdır (claimReturnId); sayfa başına 20 talep. Tarihler gg/aa/yyyy. Ret gerekçeleri ClaimReturnDenyReasonTypes'tan.
  // REQUESTED / APPROVAL_WAITING / PENDED (değerlendirme ertelendi) talepler karar bekler. Ret belgesi yüklenemez (yalnız görsel adresi alınır).
  const RST = { REQUESTED: 'waiting', APPROVAL_WAITING: 'waiting', PENDED: 'waiting', APPROVED: 'accepted', MANUAL_REFUND: 'accepted', DENIED: 'rejected', CANCELLED: 'other', PENDING: 'other' };
  const RST_TR = { REQUESTED: 'İade talebi geldi', APPROVAL_WAITING: 'Onay bekliyor', PENDED: 'Değerlendirme ertelendi', APPROVED: 'İade onaylandı', MANUAL_REFUND: 'Manuel para iadesi tamamlandı', DENIED: 'Reddedildi', CANCELLED: 'İptal edildi', PENDING: 'Erteleme talep edildi' };
  const dayOf = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s) || /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (!m) return null; const [y, mo, d] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[2], m[1]]; return Date.UTC(+y, +mo - 1, +d) - 3 * 3600e3; };
  async function claims({ since, until = Date.now(), page = 0 }) {
    const x = await soap('ClaimReturnList', `<searchData><status>ALL</status><executer></executer><searchInfoType></searchInfoType><searchQuery></searchQuery><sender></sender><period><startDate>${dmy(since)}</startDate><endDate>${dmy(until)}</endDate></period></searchData><pagingData><currentPage>${page}</currentPage></pagingData>`, 'returnService');
    const items = tags(x, 'claimReturn').map((c) => {
      const st = tag(c, 'status'), qty = num(tag(c, 'quantity'), 1), price = num(tag(c, 'unitPrice')), id = tag(c, 'claimReturnId');
      const reason = tag(c, 'returnReasonType'), note = tag(c, 'returnReasonDescription');
      return {
        remoteId: id, orderNumber: tag(c, 'orderNumber'), claimedAt: dayOf(tag(c, 'requestDate')) || Date.now(), status: RST[st] || 'other', remoteStatus: RST_TR[st] || st,
        customer: tag(c, 'buyerName'), reason, note,
        lines: [{ id, name: [tag(c, 'productName'), tag(c, 'attributesNames')].filter(Boolean).join(' · '), productId: tag(c, 'productId'), qty, price, reason, note, status: RST[st] || 'other', remoteStatus: RST_TR[st] || st }],
        amount: num(tag(c, 'finalPrice')) || price * qty, cargo: tag(c, 'shipmentCompany'), tracking: tag(c, 'trackingNumber'),
      };
    }).filter((c) => c.remoteId);
    return { items, hasNext: page + 1 < num(tag(tag(x, 'pagingData'), 'pageCount')) };
  }
  let reasonCache = null;
  async function claimReasons() {
    if (!reasonCache) {
      const x = await soap('ClaimReturnDenyReasonTypes', '', 'returnService');
      reasonCache = [...x.matchAll(/<(?:\w+:)?id>([\s\S]*?)<\/(?:\w+:)?id>\s*<(?:\w+:)?value>([\s\S]*?)<\/(?:\w+:)?value>/g)].map((m) => ({ id: m[1].trim(), name: tag(`<v>${m[2]}</v>`, 'v') }));
    }
    return reasonCache;
  }
  async function approveClaim(c) {
    await soap('ClaimReturnApprove', `<claimReturnId>${esc(c.remote_id)}</claimReturnId>`, 'returnService');
  }
  async function rejectClaim(c, lines, { reasonId, text }) {
    await soap('ClaimReturnDeny', `<claimReturnId>${esc(c.remote_id)}</claimReturnId><denyReasonId>${esc(reasonId)}</denyReasonId><denyReasonNote>${esc(text)}</denyReasonNote>`, 'returnService');
  }

  const missing = ['N11_APP_KEY', 'N11_APP_SECRET'].filter((k) => !env[k]);
  return {
    ...meta, type: 'n11', byOrderDate: true, enabled: !missing.length, missing,
    caps: { accept: 'remote', split: 'local', ship: 'local', label: null, createProduct: false, price: true, answer: { min: 1, max: 2048 } },
    fetchOrders, fetchListings, pushStock, pushPrice, pushStatus: status, accept, questions, answer, catalog, claims, claimReasons, approveClaim, rejectClaim,
  };
}
