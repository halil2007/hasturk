// Ozon (Seller API, api-seller.ozon.ru). Satıcı paneli (seller.ozon.ru) → Ayarlar → Seller API → Client ID + API anahtarı (rol: Admin ya da
// en az "Siparişler (FBS)", "Ürünler", "Fiyatlar ve stoklar"). Kimlik: her istekte "Client-Id" + "Api-Key" başlıkları (OAuth yok). Hepsi POST + JSON.
// Siparişler: FBS / rFBS gönderileri (posting) — panelde her gönderi bir sipariştir (posting_number). POST /v3/posting/fbs/list
// (senkronda filter.last_changed_status_date, geçmiş aktarımında filter.since/to = işleme alınma tarihi; aralık en çok 1 yıl, offset sayfalama, has_next).
// Alıcı adı / adresi yalnız rFBS'de (customer.address) gelir; Ozon lojistiğiyle giden FBS'de adres ve telefon verilmez.
// Tutar: ürün satırlarının fiyatı × adedi; para birimi satırın currency_code değeri (satıcı hesabının para birimi, çevrilmez).
// Ürünler: /v3/product/list (last_id sayfalama) → /v3/product/info/list (1000'erli; ad, barkod, görsel, fiyat, FBS stoku).
// Stok: /v2/products/stocks (100'erli; depo no zorunlu: girilmediyse hesapta tek FBS deposu varsa o kullanılır). Fiyat: /v1/product/import/prices (1000'erli).
// İşleme al: /v4/posting/fbs/ship ("Topla": gönderi awaiting_packaging → awaiting_deliver, etiket hazırlanır). Etiket: /v2/posting/fbs/package-label (PDF).
// Kargoya ver: FBS'de kurye Ozon'un (panel yalnız toplanmış olduğunu garanti eder); rFBS'de takip no girildiyse tracking-number/set + delivering.
// Ürün oluşturma, iade, soru-cevap yok. Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür.
import { http, num, str, chunk, diagStep, imageList, toB64, sleep, DEAD_LINE } from '../util.js';

const API = 'https://api-seller.ozon.ru';
const STATUS = { awaiting_registration: 'new', acceptance_in_progress: 'new', awaiting_approve: 'new', awaiting_packaging: 'new', awaiting_verification: 'new',
  awaiting_deliver: 'processing', arbitration: 'processing', client_arbitration: 'processing',
  driver_pickup: 'shipped', delivering: 'shipped', sent_by_seller: 'shipped', delivered: 'delivered', cancelled: 'cancelled', not_accepted: 'cancelled' };
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const PAGE = 50; // DOĞRULA: belgelerde /v3/posting/fbs/list limit üst sınırı 1000 olarak da geçiyor; 50 her iki durumda geçerli
const SYNC_DAYS = 30; // senkron: son 30 günde işleme alınmış gönderilerin durum değişiklikleri

export function ozon(env, meta) {
  const cid = str(env.OZON_CLIENT_ID), key = str(env.OZON_API_KEY);
  const headers = { 'Client-Id': cid, 'Api-Key': key, 'Content-Type': 'application/json', Accept: 'application/json' };
  const call = (path, body, opts = {}) => http(API + path, { method: 'POST', headers, body: JSON.stringify(body || {}), tries: 3, ...opts });

  // ---------- siparişler (FBS gönderileri) ----------
  function norm(p) {
    const st = str(p.status), status = STATUS[st] || 'new', c = p.customer || {}, a = c.address || {}, ad = p.addressee || {}, an = p.analytics_data || {};
    const items = (p.products || []).map((x) => {
      const qty = num(x.quantity, 1) || 1, unit = num(x.price);
      return { lineId: str(x.sku), sku: str(x.offer_id), barcode: '', name: str(x.name), image: '', quantity: qty, unitPrice: unit, total: unit * qty,
        status: status === 'cancelled' ? 'cancelled' : '', remoteKey: str(x.offer_id) };
    });
    const name = str(c.name || ad.name), dm = p.delivery_method || {};
    return {
      remoteId: str(p.posting_number), orderNumber: str(p.posting_number), orderedAt: Date.parse(p.in_process_at) || Date.now(),
      remoteStatus: st + (p.substatus && p.substatus !== st ? ` / ${p.substatus}` : ''), status,
      customer: name, phone: str(c.phone || ad.phone), email: '', customerId: c.customer_id ? str(c.customer_id) : '',
      address: { name, line: [a.address_tail, a.zip_code].map(str).filter(Boolean).join(', '), district: str(a.district), city: str(a.city || an.city || a.region || an.region), phone: str(c.phone || ad.phone) },
      total: items.reduce((s, i) => s + i.total, 0), currency: str(((p.products || [])[0] || {}).currency_code) || 'RUB',
      cargoCompany: str(dm.tpl_provider || an.tpl_provider), tracking: str(p.tracking_number), shipBy: Date.parse(p.shipment_date) || null, items, packages: null,
    };
  }

  // since/until ms. Senkronda son durum değişikliği (last_changed_status_date), geçmiş aktarımında (byOrdered) işleme alınma tarihi aralığı.
  // DOĞRULA: filter.since/to zorunlu kabul edildi; senkronda since = bitişten 30 gün öncesi, durum değişikliği süzgeci ayrıca uygulanır.
  async function fetchOrders(since, until, { byOrdered } = {}) {
    const filter = byOrdered ? { since: iso(since), to: iso(until) }
      : { since: iso(Math.min(since, until - SYNC_DAYS * 864e5)), to: iso(until), last_changed_status_date: { from: iso(since), to: iso(until) } };
    const out = [];
    for (let page = 0; page < 100; page++) {
      const r = (await call('/v3/posting/fbs/list', { dir: 'ASC', filter, limit: PAGE, offset: page * PAGE, with: { analytics_data: true, financial_data: false } })) || {};
      const res = r.result || {}, rows = res.postings || [];
      out.push(...rows.map(norm));
      if (!res.has_next || !rows.length) break;
    }
    return out;
  }
  async function fetchOne(id) {
    const r = (await call('/v3/posting/fbs/get', { posting_number: str(id), with: { analytics_data: true } })) || {};
    if (!r.result) throw new Error('Ozon: gönderi bulunamadı');
    return norm(r.result);
  }

  // ---------- ürünler ----------
  const cache = new Map(); // offer_id → { product_id, currency }
  async function fetchListings() {
    const ids = [];
    let last = '';
    for (let page = 0; page < 200; page++) {
      const r = ((await call('/v3/product/list', { filter: { visibility: 'ALL' }, last_id: last, limit: 1000 })) || {}).result || {};
      const rows = r.items || [];
      ids.push(...rows.filter((x) => !x.archived).map((x) => x.product_id));
      last = str(r.last_id);
      if (!last || rows.length < 1000) break;
    }
    const out = [];
    for (const part of chunk(ids, 1000)) {
      const r = (await call('/v3/product/info/list', { product_id: part })) || {};
      for (const p of r.items || []) {
        const price = num(p.price), old = num(p.old_price), images = imageList([...(p.primary_image || []), ...(p.images || [])]);
        // FBS / rFBS stoku: depodaki miktar (present). Gönderim de bu miktarı yazar (/v2/products/stocks "stock"; rezerveyi Ozon düşer):
        // okunan ile gönderilen aynı temelde karşılaştırılır (önceden present − reserved okunuyordu, rezerve olan her ilan her senkronda yeniden gönderiliyordu)
        const fbs = ((p.stocks && p.stocks.stocks) || []).filter((s) => /fbs/i.test(str(s.source)));
        cache.set(str(p.offer_id), { product_id: p.id, currency: str(p.currency_code) });
        out.push({ remoteId: str(p.offer_id), remoteProductId: str(p.id), sku: str(p.offer_id), barcode: str((p.barcodes || [])[0] || p.barcode), name: str(p.name), groupName: str(p.name), variantName: '',
          image: images[0] || '', images, price, listPrice: Math.max(old, price), stock: fbs.reduce((t, s) => t + Math.max(0, num(s.present)), 0),
          active: !p.is_archived && !p.is_autoarchived && p.visible !== false && !(p.visibility_details && p.visibility_details.active_product === false) });
      }
    }
    return out;
  }

  // Depo: girilmediyse hesabın FBS depoları okunur; tek (etkin) depo varsa o kullanılır
  let wh = str(env.OZON_WAREHOUSE_ID);
  const warehouses = async () => (((await call('/v1/warehouse/list', {})) || {}).result || []).filter((w) => !/disabled|blocked|archived/i.test(str(w.status)));
  async function warehouse() {
    if (wh) return wh;
    const list = await warehouses();
    if (list.length === 1) return (wh = str(list[0].warehouse_id));
    throw new Error(list.length ? `Ozon: ${list.length} FBS deposu var (${list.slice(0, 5).map((w) => `${w.name} ${w.warehouse_id}`).join(', ')}); Entegrasyonlar'da stok deposu numarasını girin` : 'Ozon: hesapta FBS deposu bulunamadı');
  }
  // Satır sonuçları ilan ilan: { done, errors } (yalnız reddedilen ilan yeniden denenir). Hiçbiri gönderilemeden bağlantı / yetki hatası: atılır.
  const rowErr = (x) => (x.errors || []).map((e) => e.message || e.code).join(' · ') || 'güncellenmedi';
  async function send(items, size, gap, request) {
    const out = { done: [], errors: [] };
    for (const [i, part] of chunk(items, size).entries()) {
      if (i && gap) await sleep(gap);
      let r;
      try { r = await request(part); } catch (e) {
        if (!out.done.length || e.budget) throw e;
        out.errors.push(...part.map((x) => ({ remoteId: x.remoteId, error: e.message })));
        continue;
      }
      const bad = new Map(((r && r.result) || []).filter((x) => x.updated === false || (x.errors || []).length).flatMap((x) => [[str(x.offer_id), rowErr(x)], [str(x.product_id), rowErr(x)]]));
      for (const x of part) {
        const err = bad.get(str(x.remoteId || x.sku)) || (x.remoteProductId && bad.get(str(x.remoteProductId)));
        if (err) out.errors.push({ remoteId: x.remoteId, error: 'Ozon: ' + err }); else out.done.push(x.remoteId);
      }
    }
    return out;
  }

  // Stok: 100'erli; aynı ürün-depo için 2 dakikada bir güncellenebilir (Ozon TOO_MANY_REQUESTS satır hatası döner)
  async function pushStock(items) {
    const w = Number(await warehouse());
    // dakikada 80 istek sınırı: parçalar arası 800 ms
    return send(items, 100, 800, (part) => call('/v2/products/stocks', { stocks: part.map((x) => {
      const id = str(x.remoteId || x.sku), c = cache.get(id), pid = num((c && c.product_id) || x.remoteProductId);
      return { offer_id: id, ...(pid ? { product_id: pid } : {}), stock: Math.max(0, Math.round(num(x.stock))), warehouse_id: w };
    }) }));
  }
  // Fiyat: liste fiyatı satış fiyatından büyükse old_price (üstü çizili), değilse old_price "0" (sıfırlanır). Fiyat saatte en çok 10 kez değişebilir.
  async function pushPrice(items) {
    return send(items, 1000, 0, (part) => call('/v1/product/import/prices', { prices: part.map((x) => {
      const id = str(x.remoteId || x.sku), c = cache.get(id), pid = num((c && c.product_id) || x.remoteProductId), sale = Math.round(num(x.price) * 100) / 100, list = Math.round(num(x.listPrice) * 100) / 100;
      return { offer_id: id, ...(pid ? { product_id: pid } : {}), price: String(sale), old_price: list > sale ? String(list) : '0', ...(c && c.currency ? { currency_code: c.currency } : {}), auto_action_enabled: 'UNKNOWN' };
    }) }));
  }

  // ---------- gönderi işlemleri ----------
  // İşleme al ("Topla"): tüm ürünler tek pakette. DOĞRULA: paket ürününde product_id alanına gönderideki Ozon SKU'su yazılır (belgedeki örnek bu biçimde).
  async function pack(order) {
    const products = (order.items || []).filter((i) => !DEAD_LINE(i.status) && i.line_id).map((i) => ({ product_id: num(i.line_id), quantity: Math.max(1, Math.round(num(i.quantity, 1))) }));
    if (!products.length) throw new Error('Ozon: toplanacak ürün yok');
    await call('/v4/posting/fbs/ship', { packages: [{ products }], posting_number: str(order.remote_id), with: { additional_data: false } });
  }
  async function accept(order) {
    if (order.remote_status && !/^awaiting_packaging/.test(str(order.remote_status))) return;
    await pack(order);
  }
  // Kargoya ver: toplanmamışsa önce toplanır. rFBS (satıcının kendi kargosu): takip no Ozon'a yazılır ve gönderi "teslimatta" yapılır.
  async function ship(order, pkg = {}, { tracking } = {}) {
    if (/^awaiting_packaging/.test(str(order.remote_status))) await pack(order);
    const id = str(order.remote_id), tn = str(tracking || pkg.tracking);
    if (!tn) return {};
    const r = (await call('/v2/fbs/posting/tracking-number/set', { tracking_numbers: [{ posting_number: id, tracking_number: tn }] })) || {};
    const bad = (r.result || []).find((x) => x.result === false || (x.error || []).length);
    if (bad) throw new Error(`Ozon takip numarasını kabul etmedi: ${(bad.error || []).join(' · ') || 'reddedildi'}`);
    const d = (await call('/v2/fbs/posting/delivering', { posting_number: [id] })) || {};
    const bd = (d.result || []).find((x) => x.result === false || (x.error || []).length);
    if (bd) throw new Error(`Ozon gönderiyi "teslimatta" yapmadı: ${(bd.error || []).join(' · ') || 'reddedildi'}`);
    return { tracking: tn };
  }
  // Etiket (PDF): toplandıktan 45–60 sn sonra hazır olur; hazır değilse bekleme bildirilir
  async function label(order, pkg = {}) {
    let res;
    try { res = await http(`${API}/v2/posting/fbs/package-label`, { method: 'POST', headers, body: JSON.stringify({ posting_number: [str(order.remote_id)] }), raw: true }); } catch (e) {
      if (/not.?ready|NOT_READY|awaiting_deliver|POSTINGS_NOT/i.test(e.message)) return { pending: 'Ozon etiketi hazırlıyor (toplandıktan 45–60 sn sonra hazır olur); biraz sonra tekrar deneyin.', step: 'waiting' };
      throw e;
    }
    const filename = `ozon-${order.remote_id}-${pkg.no || 1}.pdf`;
    if (/pdf|octet/i.test(res.headers.get('content-type') || '')) return { label: { format: 'pdf', data: toB64(new Uint8Array(await res.arrayBuffer())), filename } };
    const j = await res.json().catch(() => ({})); // DOĞRULA: bazı istemciler JSON (file_content, base64) biçimini bekliyor
    if (j && j.file_content) return { label: { format: 'pdf', data: str(j.file_content), filename } };
    throw new Error('Ozon etiketi alınamadı');
  }

  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    const ok = await diagStep(out, 'Kimlik (Client-Id + Api-Key) · depolar', async () => { const w = await warehouses(); return { detail: `bağlantı kuruldu · ${w.length} FBS deposu${w.length ? ': ' + w.slice(0, 5).map((x) => `${x.name} (${x.warehouse_id})`).join(', ') : ''}${wh ? ` · seçili depo ${wh}` : ''}` }; });
    if (!ok) { out.push({ name: 'İpucu', ok: null, detail: '401/403: Client ID ya da API anahtarı hatalı veya anahtarın rolü yetersiz. seller.ozon.ru → Ayarlar → Seller API: anahtarı Admin rolüyle oluşturun.' }); return out; }
    await diagStep(out, 'Gönderiler (son 7 gün, FBS)', async () => {
      const r = ((await call('/v3/posting/fbs/list', { dir: 'DESC', filter: { since: iso(now - 7 * 864e5), to: iso(now) }, limit: 1, offset: 0 })) || {}).result || {}, p = (r.postings || [])[0];
      return { detail: p ? `erişildi · örnek ${p.posting_number}: ${p.status} → ${STATUS[p.status] || 'new'}` : 'erişildi · gönderi yok' };
    });
    await diagStep(out, 'Ürünler', async () => { const r = ((await call('/v3/product/list', { filter: { visibility: 'ALL' }, last_id: '', limit: 1 })) || {}).result || {}; return { detail: `${num(r.total)} ürün` }; });
    if (orderId) await diagStep(out, `Gönderi ${orderId}`, async () => { const o = await fetchOne(orderId); return { detail: `${o.items.length} ürün · ${o.remoteStatus} → ${o.status}${o.tracking ? ` · takip ${o.tracking}` : ''}` }; });
    return out;
  }

  const missing = ['OZON_CLIENT_ID', 'OZON_API_KEY'].filter((k) => !str(env[k]));
  return {
    ...meta, type: 'ozon', enabled: !missing.length, missing,
    caps: { accept: 'remote', split: 'local', ship: 'remote', label: 'remote', createProduct: false, price: true, manualTracking: true },
    fetchOrders, fetchOne, fetchListings, pushStock, pushPrice, accept, ship, label, diagnose,
  };
}
