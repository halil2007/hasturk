// OpenCart (kendi web siteniz): komisyon yok, etiketi panel basar, takip no satıcı girer.
// OpenCart'ta kullanılabilir bir yönetim REST API'si yok: satıcı panelden indirdiği bağlantı dosyasını (public/opencart-bridge.php,
// varsayılan adı hasturk-baglanti.php) OpenCart ana klasörüne (config.php'nin yanına) yükler. Dosya veritabanına config.php bilgileriyle bağlanır.
// İstek: POST {site}/{dosya}?action=… · JSON gövde · X-Hasturk-Key başlığında dosyaya gömülü anahtar (yalnız HTTPS; anahtar düz HTTP'den gönderilmez).
// Siparişler: senkronda değiştirilme tarihine, geçmiş aktarımında sipariş tarihine göre. Durumu 0 olan (yarım kalmış) siparişler alınmaz.
// Durumlar mağazaya göre adlandırıldığından addan tahmin edilir. Tutarlar: OpenCart satır fiyatı KDV hariç + birim vergisi → (fiyat + vergi) × adet;
// veritabanındaki tutarlar varsayılan para biriminde, siparişin para birimine currency_value ile çevrilir.
// Seçenekler (beden, renk…): her seçenek değeri ayrı ilan (remoteId "<ürün>:<seçenek değeri>"); seçenek fiyatı OpenCart'ta ana fiyata eklenen farktır.
// Kargoya verme: sipariş geçmişine müşteriye görünen not (kargo firması + takip no) + "Kargoya verildi" durumu. Yok: ürün oluşturma, iadeler, sorular.
import { http, num, str, r2, chunk, imageList, diagStep } from '../util.js';

// Durum adı → panel durumu (OpenCart varsayılanları: Pending, Processing, Shipped, Complete, Canceled, Denied, Canceled Reversal, Failed, Refunded, Reversed, Chargeback, Expired, Processed, Voided)
export const ocStatus = (s) => {
  const t = str(s).toLocaleLowerCase('tr');
  if (/reversal/.test(t)) return 'new'; // "Canceled Reversal": ödemenin geri alınması iptal edildi, sipariş geçerli
  if (/refund|iade|chargeback|return/.test(t)) return 'returned';
  if (/cancel|iptal|denied|reddedil|void|revers|expired|süresi dol|fail|başarısız/.test(t)) return 'cancelled';
  if (/deliver|teslim|complete|tamamlan/.test(t)) return 'delivered';
  if (/ship|kargo|gönderildi/.test(t)) return 'shipped';
  return 'new'; // pending, processing, hazırlanıyor, bilinmeyen
};
const name2 = (...a) => a.map(str).filter(Boolean).join(' ');

export function opencart(env, meta) {
  const base0 = str(env.OPENCART_URL).replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\/(admin(\/.*)?|index\.php(\/.*)?|[^/]+\.php)$/i, '').replace(/\/+$/, '');
  const site = /^https:\/\/[^\s/]+/i.test(base0) ? base0 : ''; // anahtar düz HTTP'den gönderilmez
  const bridge = /^[A-Za-z0-9._-]+\.php$/.test(str(env.OPENCART_BRIDGE)) ? str(env.OPENCART_BRIDGE) : 'hasturk-baglanti.php';
  const key = str(env.OPENCART_KEY), shipStatus = Number(env.OPENCART_SHIP_STATUS) || 0;

  // Dosya yüklenmemişse OpenCart çoğu zaman HTML sayfa döner (SEO adresleri): JSON değilse anlaşılır hata
  async function call(action, body = {}) {
    const r = await http(`${site}/${bridge}?action=${action}`, { method: 'POST', body: JSON.stringify({ ...body, key }), timeout: 30000,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Hasturk-Key': key } });
    if (!r || typeof r !== 'object' || r.ok !== true) throw new Error(`OpenCart: ${site}/${bridge} bağlantı dosyası yanıt vermedi${r && r.message ? ` (${r.message})` : ' (dosya yüklenmemiş ya da adı farklı)'}`);
    return r;
  }

  function norm(o) {
    const rate = num(o.currency_value, 1) || 1, money = (v) => r2(num(v) * rate);
    // Teslimat adresi boşsa (ör. kargo gerektirmeyen ürün) fatura adresi; Türkiye'de "bölge" il, "şehir" ilçedir
    const p = o.shipping_address_1 || o.shipping_city ? 'shipping_' : 'payment_', a = (k) => str(o[p + k]);
    const il = a('zone'), city = a('city');
    const items = (o.products || []).map((it) => {
      const qty = num(it.quantity, 1), unit = money(num(it.price) + num(it.tax)), opts = it.options || [];
      const ov = opts.find((x) => num(x.product_option_value_id) > 0), vals = opts.map((x) => str(x.value)).filter(Boolean).join(' / ');
      return { lineId: str(it.order_product_id), sku: str(it.sku || it.model), barcode: str(it.ean || it.upc), name: vals ? `${str(it.name)} - ${vals}` : str(it.name), image: str(it.image), quantity: qty,
        unitPrice: unit, total: r2(unit * qty), status: '', remoteKey: ov ? `${it.product_id}:${ov.product_option_value_id}` : str(it.product_id) };
    });
    const customer = name2(o.firstname, o.lastname) || name2(a('firstname'), a('lastname'));
    return {
      remoteId: str(o.order_id), orderNumber: str(o.order_id), orderedAt: num(o.added) ? num(o.added) * 1000 : Date.now(),
      remoteStatus: str(o.status) || str(o.order_status_id), status: ocStatus(o.status),
      customer, phone: str(o.telephone), email: str(o.email), customerId: num(o.customer_id) ? str(o.customer_id) : '',
      address: { name: name2(a('firstname'), a('lastname')) || customer, line: name2(a('address_1'), a('address_2')),
        district: il && city && il.toLocaleLowerCase('tr') !== city.toLocaleLowerCase('tr') ? city : '', city: il || city, phone: str(o.telephone) },
      total: money(o.total), currency: str(o.currency_code) || 'TRY',
      cargoCompany: '', tracking: '', items, packages: null,
    };
  }

  async function fetchOrders(since, until, { byOrdered = false } = {}) {
    const out = [], range = { since: Math.floor(since / 1000), until: Math.ceil(until / 1000), by: byOrdered ? 'added' : 'modified', limit: 100 };
    for (let page = 1; page <= 50; page++) {
      const r = await call('orders', { ...range, page });
      for (const o of r.orders || []) out.push(norm(o));
      if (!r.more) break;
    }
    return out;
  }

  // Ürün: seçeneği yoksa tek ilan; seçenek değerleri varsa her değer ayrı ilan (fiyat = ana fiyat ± fark, stok = seçenek adedi)
  const listing = (p, v) => {
    const base = num(p.price), sp = num(p.special) > 0 && num(p.special) < base ? num(p.special) : 0;
    const d = v ? (v.price_prefix === '-' ? -1 : 1) * num(v.price) : 0, vname = v ? str(v.name) : '';
    return { remoteId: v ? `${p.product_id}:${v.product_option_value_id}` : str(p.product_id), remoteProductId: str(p.product_id),
      sku: v ? '' : str(p.sku || p.model), barcode: v ? '' : str(p.ean || p.upc), // seçenek değerinin kendi kodu yok: ana ürünün kodu tüm varyantlara yazılmaz
      name: vname ? `${str(p.name)} - ${vname}` : str(p.name), groupName: str(p.name), variantName: vname, image: str(p.image), images: imageList([p.image, ...(p.images || [])]),
      price: r2((sp || base) + d), listPrice: r2(base + d), stock: Math.max(0, num(v ? v.quantity : p.quantity)), active: num(p.status) === 1 };
  };
  async function fetchListings() {
    const out = [];
    for (let page = 1; page <= 200; page++) {
      const r = await call('products', { page, limit: 500 });
      for (const p of r.products || []) { if ((p.options || []).length) for (const v of p.options) out.push(listing(p, v)); else out.push(listing(p)); }
      if (!r.more) break;
    }
    return out;
  }

  // remoteId "<ürün>:<seçenek değeri>" → { product_id, option_value_id }
  const ids = (x) => { const [pid, ov] = String(x.remoteId).split(':'); return { product_id: Number(x.remoteProductId || pid) || Number(pid) || 0, ...(ov ? { option_value_id: Number(ov) || 0 } : {}) }; };
  async function send(action, items, fields) {
    const errs = [];
    for (const part of chunk(items, 200)) {
      const r = await call(action, { items: part.map((x) => ({ ...ids(x), ...fields(x) })) });
      for (const e of r.errors || []) errs.push(`${e.product_id}${e.option_value_id ? ':' + e.option_value_id : ''}: ${e.message}`);
    }
    if (errs.length) throw new Error(`OpenCart: ${errs.length} ürün güncellenemedi (${errs.slice(0, 3).join('; ')})`);
  }
  const pushStock = (items) => send('stock', items, (x) => ({ quantity: Math.max(0, Math.round(num(x.stock))) }));
  // Ana fiyat = liste fiyatı; satış fiyatı düşükse indirimli fiyat (product_special) olarak yazılır, değilse panelin yazdığı indirim silinir
  const pushPrice = (items) => send('price', items, (x) => {
    const price = num(x.price), list = Math.max(num(x.listPrice), price);
    return { price: list, special: price < list ? price : 0 };
  });

  // Kargoya ver: sipariş geçmişine müşteriye görünen not + "Kargoya verildi" durumu (başka açık paket varsa yalnız not)
  async function ship(order, pkg, { cargoCompany, tracking } = {}) {
    const others = (order.packages || []).filter((p) => p.status === 'open' && (!pkg || p.id !== pkg.id));
    const note = [cargoCompany && `Kargo: ${cargoCompany}`, tracking && `Takip: ${tracking}`].filter(Boolean).join(' · ');
    if (others.length && !note) return {};
    await call('ship', { order_id: Number(order.remote_id), order_status_id: shipStatus, keep_status: others.length > 0, comment: note || 'Siparişiniz kargoya verildi', notify: true });
    return {};
  }

  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    let r = null;
    const ping = await diagStep(out, 'OpenCart bağlantı dosyası', async () => {
      r = await call('ping');
      return { detail: `${site}/${bridge} · OpenCart ${r.version || '?'} · PHP ${r.php || '?'} · ${num(r.counts && r.counts.products)} ürün, ${num(r.counts && r.counts.orders)} sipariş` };
    });
    if (!ping) { out.push({ name: 'İpucu', ok: null, detail: `404 ya da "yanıt vermedi": ${bridge} dosyasını panelden indirip OpenCart ana klasörüne (config.php'nin yanına) yükleyin · 401: dosyadaki anahtar paneldekiyle aynı değil, dosyayı yeniden indirip yükleyin · 500: config.php / veritabanı okunamadı` }); return out; }
    await diagStep(out, 'Siparişler (son 7 gün)', async () => { const o = await fetchOrders(now - 7 * 864e5, now); return { detail: `${o.length} sipariş${o[0] ? ` · örnek #${o[0].orderNumber}: ${o[0].remoteStatus} → ${o[0].status}` : ''}` }; });
    if (orderId) await diagStep(out, `Sipariş ${orderId}`, async () => {
      const o = ((await call('orders', { ids: [Number(orderId) || 0] })).orders || [])[0];
      if (!o) throw new Error('Sipariş bulunamadı (durumu 0 olan yarım siparişler alınmaz)');
      return { detail: `#${o.order_id}: ${o.status} → ${ocStatus(o.status)} · ${(o.products || []).length} kalem` };
    });
    const s = r && r.ship_status;
    out.push({ name: 'Kargoya verildi durumu', ok: shipStatus || s ? true : false,
      detail: shipStatus ? `Panelde girilen durum no: ${shipStatus}` : s ? `${s.name} (no ${s.order_status_id}) kullanılacak` : 'Adı "Shipped" / "Kargo…" olan sipariş durumu yok: gelişmiş ayarlardan durum numarasını girin' });
    return out;
  }

  const missing = [!site && 'OPENCART_URL', !key && 'OPENCART_KEY'].filter(Boolean);
  return {
    ...meta, type: 'opencart', enabled: !missing.length, missing,
    caps: { accept: 'local', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: true },
    fetchOrders, fetchListings, pushStock, pushPrice, ship, diagnose,
  };
}
