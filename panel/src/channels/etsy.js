// Etsy (Open API v3, openapi.etsy.com/v3/application). etsy.com/developers → Your Apps: keystring (API Key) + shared secret.
// Kimlik: OAuth 2 refresh token (kapsamlar: transactions_r transactions_w listings_r listings_w shops_r) → 1 saatlik erişim belirteci.
// Her istekte x-api-key: "keystring:shared_secret" (2025'ten beri birleşik biçim zorunlu) + Authorization: Bearer.
// Etsy her yenilemede YENİ refresh token verir: en yenisi kanalın kv deposunda { token, base } olarak saklanır; kullanıcı Entegrasyonlar'da
// başka bir refresh token girerse (base değişir) girilen kazanır.
// Siparişler: shops/{id}/receipts (senkronda son değişiklik, geçmiş aktarımında oluşturulma aralığı). Ürünler: aktif ilanlar + envanter
// (her ürün / varyant bir satır). Stok / fiyat: ilanın tüm envanteri okunur, ilgili satırlar değiştirilip PUT ile geri yazılır.
// Kargoya verme: receipts/{id}/tracking (takip no + kargo firması). İşleme alma panelde. Ürün oluşturma, etiket, iade yok.
// Bağlantı onaylanana kadar kanal yalnızca Entegrasyonlar'da görünür.
import { http, num, str, sleep, diagStep, imageList } from '../util.js';

const API = 'https://openapi.etsy.com/v3/application';
const money = (p) => (p ? num(p.amount) / (num(p.divisor) || 1) : 0);
const ent = (s) => str(s).replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const ON_PROP = ['price_on_property', 'quantity_on_property', 'sku_on_property', 'readiness_state_on_property'];

export function etsy(env, meta) {
  const shop = str(env.ETSY_SHOP_ID), key = str(env.ETSY_API_KEY), base = str(env.ETSY_REFRESH_TOKEN);
  const apiKey = `${key}:${str(env.ETSY_SHARED_SECRET)}`, kv = meta && meta.kv;
  let access = null, exp = 0, refresh = null, pending = null, inc = 'Images,Inventory';

  async function stored() {
    try { const v = kv ? await kv.get('refresh') : null; return v && v.token && v.base === base ? v : null; } catch { return null; }
  }
  async function renew(force) {
    const s = await stored();
    if (!force && s && s.access && s.exp > Date.now()) { access = s.access; exp = s.exp; refresh = s.token; return access; }
    // Sırayla denenir: kayıtlı (en son döndürülmüş) belirteç, bu nesnenin son belirteci, girilen belirteç
    const cands = [s && s.token, refresh, base].filter((t, i, l) => t && l.indexOf(t) === i);
    let err = null;
    for (const t of cands) {
      let r;
      try {
        r = await http('https://api.etsy.com/v3/public/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'refresh_token', client_id: key, refresh_token: t }).toString() });
      } catch (e) { err = e; if (e.status === 400 || e.status === 401) continue; throw e; }
      if (!r || !r.access_token) throw new Error('Etsy erişim belirteci alınamadı');
      access = r.access_token; exp = Date.now() + Math.max(60, num(r.expires_in, 3600) - 120) * 1000; refresh = r.refresh_token || t;
      try { if (kv) await kv.set('refresh', { token: refresh, base, access, exp }); } catch { /* saklanamadı: bir sonraki yenilemede yine denenir */ }
      return access;
    }
    throw new Error('Etsy refresh token geçersiz ya da süresi dolmuş; uygulamayı yeniden yetkilendirip yeni refresh token girin' + (err ? ` (${err.message.slice(0, 200)})` : ''));
  }
  async function auth(force) {
    if (!force && access && Date.now() < exp) return access;
    return (pending ||= renew(force).finally(() => { pending = null; }));
  }
  async function call(path, opts = {}, retried) {
    const headers = { 'x-api-key': apiKey, Authorization: `Bearer ${await auth()}`, 'Content-Type': 'application/json', Accept: 'application/json' };
    try { return await http(API + path, { ...opts, headers, body: opts.body && JSON.stringify(opts.body) }); } catch (e) {
      if (e.status !== 401 || retried) throw e;
      access = null; exp = 0; await auth(true); // belirteç geçersiz kılındı: bir kez yenilenip tekrar denenir
      return call(path, opts, true);
    }
  }

  const keyOf = (lid, pid, sku) => str(sku) || `${lid}:${pid}`;
  function norm(rc) {
    const st = str(rc.status).toLowerCase();
    const status = /^cancel/.test(st) ? 'cancelled' : st === 'fully refunded' ? 'returned' : st === 'completed' || rc.is_shipped ? 'shipped' : 'new';
    const tx = rc.transactions || [];
    const items = tx.map((t) => {
      const qty = num(t.quantity, 1), unit = money(t.price), v = (t.variations || []).map((x) => ent(x.formatted_value)).filter(Boolean).join(' / ');
      return { lineId: str(t.transaction_id), sku: str(t.sku), barcode: '', name: ent(t.title) + (v ? ` (${v})` : ''), image: '', quantity: qty, unitPrice: unit, total: unit * qty,
        status: status === 'cancelled' ? 'cancelled' : '', remoteKey: t.product_id ? keyOf(t.listing_id, t.product_id, t.sku) : str(t.sku || t.listing_id) };
    });
    const sh = [...(rc.shipments || [])].reverse().find((x) => x.tracking_code) || {};
    const due = tx.map((t) => num(t.expected_ship_date)).filter((x) => x > 0);
    // Türkiye adresinde il "state", ilçe "city" alanındadır (state yoksa city il kabul edilir)
    return {
      remoteId: str(rc.receipt_id), orderNumber: str(rc.receipt_id), orderedAt: num(rc.created_timestamp || rc.create_timestamp) * 1000 || Date.now(), remoteStatus: str(rc.status), status,
      customer: str(rc.name), phone: '', email: str(rc.buyer_email), customerId: str(rc.buyer_user_id),
      address: { name: str(rc.name), line: [rc.first_line, rc.second_line, [rc.zip, rc.country_iso === 'TR' ? '' : rc.country_iso].map(str).filter(Boolean).join(' ')].map(str).filter(Boolean).join(', '),
        district: rc.state ? str(rc.city) : '', city: str(rc.state || rc.city), phone: '' },
      total: money(rc.grandtotal) || items.reduce((s, i) => s + i.total, 0), currency: str((rc.grandtotal || {}).currency_code || ((tx[0] || {}).price || {}).currency_code) || 'USD',
      cargoCompany: str(sh.carrier_name), tracking: str(sh.tracking_code), shipBy: due.length ? Math.min(...due) * 1000 : null, items, packages: null,
    };
  }

  // since/until ms. Senkronda son değişiklik (last_modified), geçmiş aktarımında (byOrdered) oluşturulma tarihi aralığı
  async function fetchOrders(since, until, { byOrdered } = {}) {
    const k = byOrdered ? 'created' : 'last_modified', out = [];
    for (let page = 0; page < 50; page++) {
      const r = await call(`/shops/${shop}/receipts?min_${k}=${Math.floor(since / 1000)}&max_${k}=${Math.ceil(until / 1000)}&limit=100&offset=${page * 100}`);
      const rows = (r && r.results) || [];
      out.push(...rows.map(norm));
      if (rows.length < 100 || (r.count != null && (page + 1) * 100 >= num(r.count))) break;
    }
    return out;
  }

  async function listingsPage(offset) {
    try { return await call(`/shops/${shop}/listings?state=active&limit=100&offset=${offset}&includes=${inc}`); } catch (e) {
      if (e.status !== 400 || inc === 'Images') throw e;
      inc = 'Images'; // envanter eklentisi kabul edilmezse ilan başına envanter okunur
      return call(`/shops/${shop}/listings?state=active&limit=100&offset=${offset}&includes=${inc}`);
    }
  }
  async function fetchListings() {
    const out = [], seen = new Set();
    for (let page = 0; page < 100; page++) {
      const r = await listingsPage(page * 100), rows = (r && r.results) || [];
      for (const l of rows) {
        const inv = l.inventory || (await sleep(100), await call(`/listings/${l.listing_id}/inventory`));
        const imgs = [...(l.images || [])].sort((a, b) => num(a.rank) - num(b.rank)).map((i) => i.url_fullxfull || i.url_570xN);
        for (const p of ((inv && inv.products) || []).filter((x) => !x.is_deleted)) {
          const o = (p.offerings || []).find((x) => !x.is_deleted) || {};
          let id = str(p.sku);
          if (!id || seen.has(id)) id = `${l.listing_id}:${p.product_id}`;
          seen.add(id);
          const variant = (p.property_values || []).map((v) => (v.values || []).map(ent).join('/')).filter(Boolean).join(' / ');
          out.push({ remoteId: id, remoteProductId: str(l.listing_id), sku: str(p.sku), barcode: '', name: ent(l.title) + (variant ? ` (${variant})` : ''), groupName: ent(l.title), variantName: variant,
            image: str(imgs[0]), images: imageList(imgs), price: money(o.price) || money(l.price), listPrice: money(o.price) || money(l.price), stock: num(o.quantity),
            active: l.state === 'active' && o.is_enabled !== false });
        }
      }
      if (rows.length < 100 || (r.count != null && (page + 1) * 100 >= num(r.count))) break;
    }
    return out;
  }

  // Envanter yazımı: ilanın tüm ürünleri (salt okunur alanlar çıkarılarak) geri gönderilir. Değer özelliğe göre değişmiyorsa
  // (ör. quantity_on_property boş) Etsy tüm varyantlarda aynı değeri ister: o zaman değer ilanın tüm satırlarına yazılır.
  async function writeInventory(items, prop, apply) {
    const by = new Map(), errs = [];
    for (const x of items) {
      const lid = str(x.remoteProductId) || (/^\d+:\d+$/.test(str(x.remoteId)) ? str(x.remoteId).split(':')[0] : '');
      if (!lid) { errs.push(`${x.remoteId}: ilan numarası yok`); continue; }
      by.set(lid, [...(by.get(lid) || []), x]);
    }
    let n = 0;
    for (const [lid, list] of by) {
      if (n++) await sleep(150);
      const inv = await call(`/listings/${lid}/inventory`);
      const products = (inv.products || []).filter((p) => !p.is_deleted).map((p) => ({
        _id: p.product_id, sku: str(p.sku),
        property_values: (p.property_values || []).map((v) => ({ property_id: v.property_id, value_ids: v.value_ids || [], scale_id: v.scale_id ?? null, property_name: v.property_name, values: v.values || [] })),
        offerings: (p.offerings || []).filter((o) => !o.is_deleted).map((o) => ({ price: money(o.price), quantity: num(o.quantity), is_enabled: o.is_enabled !== false,
          ...(o.readiness_state_id != null ? { readiness_state_id: o.readiness_state_id } : {}) })),
      }));
      const shared = !(inv[prop] || []).length && products.length > 1;
      for (const x of list) {
        const hit = products.filter((p) => (p.sku && p.sku === str(x.remoteId)) || `${lid}:${p._id}` === str(x.remoteId));
        if (!hit.length) { errs.push(`${x.remoteId}: ilanda bulunamadı`); continue; }
        for (const p of shared ? products : hit) for (const o of p.offerings) apply(o, x);
      }
      const body = { products: products.map(({ _id, ...p }) => p) };
      for (const k of ON_PROP) if (Array.isArray(inv[k])) body[k] = inv[k];
      await call(`/listings/${lid}/inventory`, { method: 'PUT', body });
    }
    if (errs.length) throw new Error('Etsy: ' + errs.slice(0, 5).join(' | '));
  }
  const pushStock = (items) => writeInventory(items, 'quantity_on_property', (o, x) => { o.quantity = Math.min(999, Math.max(0, Math.round(num(x.stock)))); });
  const pushPrice = (items) => writeInventory(items, 'price_on_property', (o, x) => { o.price = Math.round(num(x.price) * 100) / 100; });

  // Kargoya ver: takip no + kargo firması (Etsy alıcıya bildirim gönderir)
  async function ship(order, pkg, { cargoCompany, tracking }) {
    if (!tracking) throw new Error('Etsy: kargoya vermek için takip numarası girin');
    await call(`/shops/${shop}/receipts/${encodeURIComponent(order.remote_id)}/tracking`, { method: 'POST', body: { tracking_code: str(tracking), carrier_name: str(cargoCompany) || 'other' } });
    return { tracking };
  }

  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    await diagStep(out, 'Kimlik (OAuth belirteci)', async () => { const s = await stored(); await auth(); return { detail: `alındı · refresh token: ${s ? 'panelin sakladığı (yenilenmiş)' : 'girilen'}` }; });
    await diagStep(out, 'Mağaza', async () => { const r = await call(`/shops/${shop}`); return { detail: `${str(r.shop_name)} · ${str(r.currency_code)} · ${num(r.listing_active_count)} aktif ilan` }; });
    await diagStep(out, 'Siparişler (son 24 saat)', async () => { const r = await call(`/shops/${shop}/receipts?min_created=${Math.floor((now - 864e5) / 1000)}&limit=1`); return { detail: `${num(r.count)} sipariş` }; });
    await diagStep(out, 'İlanlar / envanter', async () => {
      const r = await call(`/shops/${shop}/listings?state=active&limit=1`), l = (r.results || [])[0];
      if (l) await call(`/listings/${l.listing_id}/inventory`);
      return { detail: `${num(r.count)} aktif ilan${l ? ' · envanter okundu' : ''}` };
    });
    if (orderId) await diagStep(out, 'Sipariş', async () => ({ detail: JSON.stringify(await call(`/shops/${shop}/receipts/${encodeURIComponent(orderId)}`)).slice(0, 600) }));
    return out;
  }

  const missing = ['ETSY_SHOP_ID', 'ETSY_API_KEY', 'ETSY_SHARED_SECRET', 'ETSY_REFRESH_TOKEN'].filter((k) => !env[k]);
  return {
    ...meta, type: 'etsy', enabled: !missing.length, missing,
    caps: { accept: 'local', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: true },
    fetchOrders, fetchListings, pushStock, pushPrice, ship, diagnose,
  };
}
