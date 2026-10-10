// T-Soft (kendi web siteniz, T-Soft altyapısı): komisyon yok, etiketi panel basar, takip no satıcı girer.
// REST1 web servisi mağazanın kendi alan adında: https://{mağaza}/rest1/{modül}/{metot} · her istek POST, form (x-www-form-urlencoded) gövde.
// Kullanıcı: T-Soft paneli → Ayarlar → Kullanıcı Yönetimi → Web Servis Kullanıcıları (metot bazlı yetki, isteğe bağlı IP kısıtı; "Sınırlı Hesap"
// panel girişini kapatır). Metotlar https://{mağaza}/rest1/console adresinden denenebilir.
// Kimlik: POST /rest1/auth/login/{kullanıcı} (pass=şifre) → token; sonraki her istekte token parametresi. Token oturum süresi kadar geçerlidir:
// kanal deposunda (kv) saklanır, süresi dolunca ya da servis token hatası verince bir kez yeniden giriş yapılır.
// Yanıt zarfı: { success, data: [...], message: [{ type, code, text }], summary: { totalRecordCount } }. Listeler start (0'dan) + limit ile sayfalanır.
// Siparişler: order2/getOrders (OrderDateTimeStart / End). Güncellenme süzgeci belgelenmediğinden senkronda son 7 günde oluşturulan siparişler
// okunur, güncellenme zamanı (UpdateDateTimeStamp) varsa aralığa göre süzülür. Durum adları mağazaya göre değiştiğinden addan tahmin edilir.
// İlanlar: product/get (ana ürünler) + subProduct/getSubProducts (varyantlar: SubProductCode). Varyantlı ana ürün ilan olarak alınmaz.
// Stok: subProduct/updateStock (SubProductCode + Stock), varyantsız üründe product/updateStock (ProductCode + Stock). Fiyatlar T-Soft'ta KDV hariç tutulur
// (Vat oranı ayrı): panelin KDV dahil fiyatı KDV düşülerek yazılır. Kargoya verme: order2/updateOrderStatusAsSentToCargo (OrderCode + CargoCode + takip no).
// Yok: ürün oluşturma, iade talepleri, soru-cevap.
import { http, num, str, r2, chunk, imageList, diagStep, pool } from '../util.js';

export function tsoftSite(v) {
  const h = str(v).replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '').toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) ? `https://${h}` : ''; // şifre düz HTTP'den gönderilmez
}
// Durum adı → panel durumu (T-Soft varsayılanları ve mağaza tanımlı adlar)
export const tsoftStatus = (s) => {
  const t = str(s).toLocaleLowerCase('tr');
  if (/iade|return|refund/.test(t)) return 'returned';
  if (/iptal|cancel|reddedil|başarısız|fail/.test(t)) return 'cancelled';
  if (/teslim edildi|deliver|tamamlan|complete/.test(t)) return 'delivered';
  if (/kargo|ship|gönderildi|yolda/.test(t) && !/hazır/.test(t)) return 'shipped';
  if (/hazırlan|paketlen|tedarik|kargoya hazır|process/.test(t)) return 'processing';
  return 'new'; // yeni, onay bekliyor, ödeme bekleniyor, bilinmeyen
};
const isPending = (s) => /ödeme bekl|odeme bekl|havale|eft bekl/.test(str(s).toLocaleLowerCase('tr'));
const yes = (v) => v === true || v === 1 || /^(true|1)$/i.test(str(v));
// "2026-10-01 12:30:00" (Türkiye saati), ISO ya da UNIX saniye
const TR = 3 * 3600e3;
export function tsDate(v) {
  const s = str(v);
  if (!s || /^0000-/.test(s)) return 0;
  if (/^\d{9,11}$/.test(s)) return Number(s) * 1000;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s.replace(' ', 'T') : s.replace(' ', 'T') + '+03:00';
  return Date.parse(iso) || 0;
}
const isoUtc = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const msgText = (r) => (Array.isArray(r && r.message) ? r.message : []).map((m) => (Array.isArray(m.text) ? m.text.join(' ') : str(m.text || m.code))).filter(Boolean).join(' · ');

export function tsoft(env, meta = {}) {
  const site = tsoftSite(env.TSOFT_URL), user = str(env.TSOFT_USER), pass = str(env.TSOFT_PASS), cargoCode = str(env.TSOFT_CARGO_CODE);
  const kv = meta && meta.kv, API = site + '/rest1';
  let token = '', exp = 0;

  async function login(force = false) {
    if (!force && token && Date.now() < exp - 60e3) return token;
    if (!force && kv) {
      const c = await Promise.resolve(kv.get('token')).catch(() => null);
      if (c && c.token && c.user === user && c.site === site && num(c.exp) > Date.now() + 60e3) { token = c.token; exp = num(c.exp); return token; }
    }
    let r;
    try {
      r = await http(`${API}/auth/login/${encodeURIComponent(user)}`, { method: 'POST', tries: 1, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ pass }).toString() });
    } catch (e) { throw new Error(`T-Soft: giriş yapılamadı (${e.message.slice(0, 200)})`); }
    // DOĞRULA: başarılı yanıtın data[0].token (+ expirationTime) biçimi; data nesne ya da kök token da kabul edilir
    const d = r && (Array.isArray(r.data) ? r.data[0] : r.data);
    const t = str((d && (d.token || d.Token)) || (r && r.token));
    if (!r || r.success === false || !t) throw new Error(`T-Soft: giriş yapılamadı${msgText(r) ? ` (${msgText(r)})` : ''} · web servis kullanıcı adı / şifresi doğru mu, kullanıcı aktif ve IP kısıtı yok mu?`);
    const e = tsDate(d && (d.expirationTime || d.ExpirationTime));
    token = t; exp = e > Date.now() ? e : Date.now() + 3600e3; // süre verilmezse 1 saat
    if (kv) await Promise.resolve(kv.set('token', { token, exp, user, site })).catch(() => null);
    return token;
  }

  // Servis çağrısı: success=false → mesajlı hata; token hatasında bir kez yeniden giriş
  async function call(path, params = {}, retry = true) {
    const form = new URLSearchParams();
    form.set('token', await login());
    for (const [k, v] of Object.entries(params)) if (v != null && v !== '') form.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    const r = await http(`${API}/${path}`, { method: 'POST', timeout: 40000, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: form.toString() });
    if (!r || typeof r !== 'object') throw new Error(`T-Soft: ${path} JSON dışı yanıt verdi (REST servisi kapalı ya da adres yanlış)`);
    if (r.success === false) {
      const m = msgText(r);
      if (retry && /token|oturum|session|login|giriş/i.test(m)) { token = ''; exp = 0; await login(true); return call(path, params, false); }
      throw new Error(`T-Soft: ${path} başarısız${m ? ` (${m})` : ''}`);
    }
    return r;
  }
  const rows = (r) => (Array.isArray(r && r.data) ? r.data : []);

  function norm(o) {
    const lines = o.OrderDetails || o.OrderProducts || o.Products || [];
    const items = (Array.isArray(lines) ? lines : []).map((it, i) => {
      const qty = num(it.Quantity, 1) || 1;
      // DOĞRULA: satır fiyatı alan adları (SellingPriceVatIncluded yoksa SellingPrice + Vat oranı)
      const unit = r2(num(it.SellingPriceVatIncluded) || num(it.SellingPrice ?? it.Price) * (1 + num(it.Vat ?? it.VatRate) / 100));
      const props = [it.Property1, it.Property2].map(str).filter(Boolean).join(' / '), st = str(it.Status || it.SupplyStatus).toLocaleLowerCase('tr');
      return { lineId: str(it.OrderProductId || it.Id || it.OrderDetailId || i + 1), sku: str(it.SubProductCode || it.ProductCode), barcode: str(it.Barcode),
        name: props && !str(it.ProductName).includes(props) ? `${str(it.ProductName)} - ${props}` : str(it.ProductName), image: imageList([it.ImageUrl])[0] || '', quantity: qty,
        unitPrice: unit, total: r2(unit * qty), status: /iptal|cancel/.test(st) ? 'cancelled' : /iade|return/.test(st) ? 'returned' : '', remoteKey: str(it.SubProductCode || it.ProductCode) };
    });
    const status = str(o.OrderStatus || o.Status);
    const name = str(o.DeliveryName) || str(o.CustomerName);
    return {
      remoteId: str(o.OrderId), orderNumber: str(o.OrderCode || o.OrderId), orderedAt: tsDate(o.OrderDateTimeStamp) || tsDate(o.OrderDate) || Date.now(),
      remoteStatus: status || str(o.OrderStatusId), status: tsoftStatus(status), awaitingPayment: isPending(status),
      // Kapıda ödeme: ödeme tipi adı (DOĞRULA: alan adı PaymentType / PaymentTypeName; değer "Kapıda Ödeme", "Kapıda Kredi Kartı")
      cod: /kap[ıi]da/i.test(str(o.PaymentTypeName || o.PaymentType || o.PaymentName)) || undefined,
      customer: str(o.CustomerName) || name, phone: str(o.DeliveryMobile || o.Mobile || o.CustomerPhone || o.DeliveryTelephone), email: str(o.CustomerUsername || o.CustomerEmail || o.Email),
      customerId: num(o.CustomerId) > 0 ? str(o.CustomerId) : '',
      address: { name, line: str(o.DeliveryAddress), district: str(o.DeliveryTown || o.DeliveryDistrict), city: str(o.DeliveryCity), phone: str(o.DeliveryMobile || o.DeliveryTelephone || o.Mobile || o.CustomerPhone) },
      total: num(o.OrderTotalPrice ?? o.GeneralTotal ?? o.Total), currency: (str(o.Currency) || 'TRY').replace(/^TL$/i, 'TRY'),
      cargoCompany: str(o.Cargo || o.CargoName || o.CargoCompanyName || o.CargoCode), tracking: str(o.CargoTrackingCode), items, packages: null,
    };
  }

  const LIM = 100, MAXP = 50;
  // DOĞRULA: FetchProductData ile kalemler aynı yanıtta; gelmezse sipariş başına order2/getOrderDetails (OrderId süzgeci) okunur
  async function withLines(list) {
    await pool(list.filter((o) => !Array.isArray(o.OrderDetails || o.OrderProducts || o.Products)), 4, async (o) => {
      o.OrderDetails = rows(await call('order2/getOrderDetails', { f: `OrderId|${num(o.OrderId)}|equal` }));
    });
    return list;
  }
  async function fetchOrders(since, until, { byOrdered = false } = {}) {
    const from = byOrdered ? since : Math.min(since, until - 7 * 864e5), out = [];
    for (let page = 0; page < MAXP; page++) {
      const r = await call('order2/getOrders', { OrderDateTimeStart: isoUtc(from), OrderDateTimeEnd: isoUtc(until), FetchProductData: 'true', start: page * LIM, limit: LIM, orderby: 'OrderId ASC' });
      const list = await withLines(rows(r));
      for (const o of list) {
        const u = tsDate(o.UpdateDateTimeStamp) || tsDate(o.UpdateDate);
        if (!byOrdered && u && (u < since || u > until)) continue;
        out.push(norm(o));
      }
      if (list.length < LIM) return out;
    }
    out.warnings = [`T-Soft: bu aralıkta ${MAXP * LIM}+ sipariş var; kalanlar alınamadı`];
    return out;
  }
  async function getOrder(id) {
    if (!(num(id) > 0)) return null;
    const list = rows(await call('order2/getOrders', { f: `OrderId|${num(id)}|equal`, FetchProductData: 'true', start: 0, limit: 1 }));
    return list[0] ? (await withLines(list))[0] : null;
  }
  async function fetchOne(id) {
    const o = await getOrder(id);
    if (!o) throw new Error('T-Soft: sipariş bulunamadı');
    return norm(o);
  }
  const orderExists = async (id) => !!(await getOrder(id));

  // ---------- ilanlar ----------
  const vatOf = new Map(); // ilan kodu → KDV oranı (fiyat gönderiminde KDV düşmek için)
  const priced = (x) => {
    const vat = num(x.Vat), list = r2(num(x.SellingPriceVatIncludedNoDiscount) || num(x.SellingPrice) * (1 + vat / 100));
    const dRaw = num(x.DiscountedSellingPrice ?? x.DiscountedPrice), disc = dRaw > 0 ? r2(dRaw * (1 + vat / 100)) : 0;
    const price = disc > 0 && disc < list ? disc : list;
    return { price, listPrice: Math.max(list, price) };
  };
  const imgs = (p) => imageList([...(p.ImageUrls || []).slice().sort((a, b) => num(a.ListNo) - num(b.ListNo)).map((i) => i.ImageUrl), p.ImageUrl]);
  async function fetchListings() {
    const out = [], parents = new Map();
    for (let page = 0; page < 500; page++) {
      const list = rows(await call('product/get', { start: page * LIM, limit: LIM, FetchImageUrls: 'true' }));
      for (const p of list) {
        parents.set(str(p.ProductId), p);
        if (yes(p.HasSubProducts)) continue;
        const code = str(p.ProductCode), im = imgs(p);
        vatOf.set(code, num(p.Vat));
        out.push({ remoteId: code, remoteProductId: code, sku: code, barcode: str(p.Barcode), name: str(p.ProductName), groupName: str(p.ProductName), variantName: '',
          image: im[0] || '', images: im, ...priced(p), stock: Math.max(0, Math.floor(num(p.Stock))), active: yes(p.IsActive) });
      }
      if (list.length < LIM) break;
    }
    for (let page = 0; page < 2000; page++) {
      const list = rows(await call('subProduct/getSubProducts', { start: page * LIM, limit: LIM }));
      for (const s of list) {
        const p = parents.get(str(s.MainProductId)) || {}, code = str(s.SubProductCode), group = str(p.ProductName || s.ProductName);
        const vname = [s.Property1, s.Property2, s.Property3].map(str).filter(Boolean).join(' / '), im = imgs(p);
        vatOf.set(code, num(s.Vat ?? p.Vat));
        out.push({ remoteId: code, remoteProductId: str(s.MainProductCode || p.ProductCode), sku: code, barcode: str(s.Barcode), name: vname ? `${group} - ${vname}` : group, groupName: group, variantName: vname,
          image: im[0] || '', images: im, ...priced({ ...s, Vat: s.Vat ?? p.Vat }), stock: Math.max(0, Math.floor(num(s.Stock))), active: yes(s.IsActive) && p.IsActive !== 'false' });
      }
      if (list.length < LIM) break;
    }
    return out;
  }

  // Varyant mı (SubProductCode) ana ürün mü (ProductCode): ilan listesinde varyantın remoteProductId'si ana ürün kodudur
  const isSub = (x) => !!(x.remoteProductId && str(x.remoteProductId) !== str(x.remoteId));
  // Sonuç ilan ilan: { done, errors }. Kalem hataları message[] içinde (type 2 = hata kabul edildi); hata metninde ilan kodu geçiyorsa
  // yalnız o ilana, geçmiyorsa (hangi ilan olduğu anlaşılamıyor) o parçanın tüm ilanlarına yazılır. Hiçbiri gönderilemeden bağlantı hatası: atılır.
  async function send(path, list, row, out) {
    for (const part of chunk(list, 100)) {
      let r;
      try { r = await call(path, { data: part.map(row) }); } catch (e) {
        if (!out.done.length || e.budget) throw e;
        out.errors.push(...part.map((x) => ({ remoteId: x.remoteId, error: e.message })));
        continue;
      }
      const msgs = ((r && r.message) || []).filter((m) => String(m.type) === '2').map((m) => (Array.isArray(m.text) ? m.text.join(' ') : str(m.text || m.code)));
      const has = (t, x) => { const c = str(x.remoteId); return !!c && new RegExp(`(^|[^\\w])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w])`).test(t); };
      const hit = (x) => msgs.find((t) => has(t, x)), loose = msgs.filter((t) => !part.some((x) => has(t, x)));
      for (const x of part) {
        const err = hit(x) || loose[0];
        if (err) out.errors.push({ remoteId: x.remoteId, error: 'T-Soft: ' + err }); else out.done.push(x.remoteId);
      }
    }
    return out;
  }
  async function pushStock(items) {
    const st = (x) => Math.max(0, Math.round(num(x.stock))), out = { done: [], errors: [] };
    const subs = items.filter(isSub), mains = items.filter((x) => !isSub(x) && str(x.remoteId));
    if (subs.length) await send('subProduct/updateStock', subs, (x) => ({ SubProductCode: str(x.remoteId), Stock: st(x) }), out);
    // DOĞRULA: varyantsız ürün stoğu için product/updateStock (ProductCode + Stock)
    if (mains.length) await send('product/updateStock', mains, (x) => ({ ProductCode: str(x.remoteId), Stock: st(x) }), out);
    return out;
  }
  // KDV oranı bilinmiyorsa ilan okunarak öğrenilir
  async function vat(x) {
    const code = str(x.remoteId);
    if (vatOf.has(code)) return vatOf.get(code);
    const d = isSub(x) ? rows(await call(`subProduct/getSubProductByCode/${encodeURIComponent(code)}`))[0] : rows(await call('product/get', { ProductCode: code, start: 0, limit: 1 }))[0];
    if (!d) throw new Error(`T-Soft: ${code} kodlu ürün bulunamadı`);
    vatOf.set(code, num(d.Vat));
    return num(d.Vat);
  }
  // Fiyat: liste fiyatı SellingPrice, satış fiyatı düşükse DiscountedSellingPrice (değilse 0 = indirim yok); ikisi de KDV hariç yazılır
  async function pushPrice(items) {
    const subs = [], mains = [], out = { done: [], errors: [] };
    await pool(items.filter((x) => str(x.remoteId)), 4, async (x) => {
      let v;
      try { v = 1 + (await vat(x)) / 100; } catch (e) { if (e.budget || !/bulunamadı/.test(e.message)) throw e; out.errors.push({ remoteId: x.remoteId, error: e.message }); return; }
      const price = num(x.price), list = Math.max(num(x.listPrice), price), ex = (n) => Math.round((n / v) * 10000) / 10000;
      (isSub(x) ? subs : mains).push({ ...x, row: { SellingPrice: ex(list), DiscountedSellingPrice: price < list ? ex(price) : 0 } });
    });
    // DOĞRULA: fiyat güncelleme metot adları (subProduct/updateSubProducts, product/updateProducts) ve alanları
    if (subs.length) await send('subProduct/updateSubProducts', subs, (x) => ({ SubProductCode: str(x.remoteId), ...x.row }), out);
    if (mains.length) await send('product/updateProducts', mains, (x) => ({ ProductCode: str(x.remoteId), ...x.row }), out);
    return out;
  }

  // Kargoya ver: siparişin son açık paketiyse "Kargoya Verildi" + takip no. Kargo kodu: ayarlardaki kod, yoksa siparişteki kargo kodu.
  async function ship(order, pkg, { tracking } = {}) {
    const others = (order.packages || []).filter((p) => p.status === 'open' && (!pkg || p.id !== pkg.id));
    if (others.length) return {};
    let code = cargoCode, no = str(order.order_number);
    if (!code || !no) { const o = await getOrder(order.remote_id); if (o) { code = code || str(o.CargoCode); no = no || str(o.OrderCode); } }
    const r = await call('order2/updateOrderStatusAsSentToCargo', { data: [{ OrderCode: no, ...(code ? { CargoCode: code } : {}), ...(tracking ? { CargoTrackingCode: String(tracking) } : {}) }] });
    const bad = ((r && r.message) || []).filter((m) => String(m.type) === '2');
    if (bad.length) throw new Error(`T-Soft: sipariş kargoya verildi yapılamadı (${msgText({ message: bad })})`);
    return {};
  }

  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    const ok = await diagStep(out, 'T-Soft girişi', async () => { await login(true); return { detail: `${site} · ${user} ile token alındı` }; });
    if (!ok) { out.push({ name: 'İpucu', ok: null, detail: `T-Soft → Ayarlar → Kullanıcı Yönetimi → Web Servis Kullanıcıları: kullanıcı aktif mi, şifre doğru mu, IP kısıtı var mı? Bilgileri ${site || 'https://mağazanız'}/rest1/console adresinde deneyebilirsiniz` }); return out; }
    await diagStep(out, 'Ürünler', async () => { const l = rows(await call('product/get', { start: 0, limit: 1 })); return { detail: l[0] ? `örnek: ${l[0].ProductName}` : 'ürün yok' }; });
    await diagStep(out, 'Siparişler (son 7 gün)', async () => { const o = await fetchOrders(now - 7 * 864e5, now); return { detail: `${o.length} sipariş${o[0] ? ` · örnek #${o[0].orderNumber}: ${o[0].remoteStatus} → ${o[0].status}` : ''}` }; });
    if (orderId) await diagStep(out, `Sipariş ${orderId}`, async () => { const o = await fetchOne(orderId); return { detail: `#${o.orderNumber}: ${o.remoteStatus} → ${o.status} · ${o.items.length} kalem` }; });
    out.push({ name: 'Kargo kodu', ok: cargoCode ? true : null, detail: cargoCode ? `Kargoya verirken ${cargoCode} kodu gönderilir` : 'Girilmedi: siparişte seçili kargo firmasının kodu kullanılır' });
    out.push({ name: 'Yetkiler', ok: null, detail: 'Web servis kullanıcısında order2, product, subProduct metotlarına yetki verilmeli (ilk gönderimde denenir)' });
    return out;
  }

  const missing = [!site && 'TSOFT_URL', !user && 'TSOFT_USER', !pass && 'TSOFT_PASS'].filter(Boolean);
  return {
    ...meta, type: 'tsoft', enabled: !missing.length, missing,
    caps: { accept: 'local', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: true },
    fetchOrders, fetchOne, orderExists, fetchListings, pushStock, pushPrice, ship, diagnose,
  };
}
