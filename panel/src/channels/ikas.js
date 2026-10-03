// ikas (GraphQL Admin API). Her ikas mağazası için bir özel uygulama gerekir:
// ikas paneli → Uygulamalar → Özel uygulama → izinler: Ürünler, Siparişler, Stok, Mağaza bilgisi (okuma + yazma).
// Kargo (ikas Kargo): paket "Kargoya Hazır" (READY_FOR_SHIPMENT) olarak oluşturulunca ikas Kargo, ikas panelindeki
// kargo önceliğine göre barkodu üretir; barkod ve etiket görseli paketin trackingInfo alanına yazılır, panel oradan okur.
// Şema kaynağı: ikas'ın resmi @ikas/admin-api-client paketi (FulFillOrderInput, UpdateOrderPackageStatusInput, TrackingInfo…).
import { http, num, str, labelFrom } from '../util.js';

const API = 'https://api.myikas.com/api/v1/admin/graphql';

export function ikas(env, p, meta) {
  const store = env[p + 'STORE'], id = env[p + 'CLIENT_ID'], secret = env[p + 'CLIENT_SECRET'];
  const salesChannel = env[p + 'SALES_CHANNEL_ID'] || '';
  let merchant = env[p + 'MERCHANT_ID'] || '', merchantTried = false;
  let token = null, tokenScope = '', tokenExp = 0, locationId = env[p + 'STOCK_LOCATION_ID'] || '';

  async function auth() {
    if (token && Date.now() < tokenExp) return token;
    const r = await http(`https://${store}.myikas.com/api/admin/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }).toString(),
    });
    if (!r || !r.access_token) throw new Error('ikas token alınamadı');
    token = r.access_token;
    tokenScope = String(r.scope || '');
    tokenExp = Date.now() + Math.max(60, (r.expires_in || 3600) - 120) * 1000;
    return token;
  }

  async function gql(query, variables = {}) {
    const r = await http(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth()}` },
      body: JSON.stringify({ query, variables }),
    });
    if (r.errors) { const e = new Error('ikas: ' + r.errors.map((x) => x.message).join(' | ')); e.gql = true; throw e; }
    return r.data;
  }

  // Şemada olmayan isteğe bağlı alan hata verirse o alanı çıkarıp tekrar dener (ikas sürüm farklarına dayanıklı)
  async function flex(build, optional, variables) {
    const active = { ...optional };
    for (;;) {
      try { return await gql(build(active), variables); } catch (e) {
        const msg = e.message.toLowerCase();
        // Şemada olmayan alt alan (ör. eski sürümde trackingInfo.shippingLabelImage): sadece o alan çıkarılır
        const f = e.gql && /cannot query field "(\w+)"(?: on type "(\w+)")?/i.exec(e.message);
        if (f && (!f[2] || f[2] === 'Order') && active[f[1]]) { active[f[1]] = ''; continue; }
        if (f) {
          const re = new RegExp(`\\s${f[1]}(\\s*\\{[^{}]*\\})?(?=[\\s}])`);
          const k = Object.keys(active).find((x) => active[x] && active[x] !== f[1] && re.test(' ' + active[x] + ' '));
          if (k) { active[k] = (' ' + active[k] + ' ').replace(re, '').trim(); continue; }
        }
        const bad = Object.keys(active).sort((a, b) => b.length - a.length).find((k) => active[k] && msg.includes(k.toLowerCase()));
        if (!e.gql || !bad) throw e;
        active[bad] = '';
      }
    }
  }

  const PKG_FIELDS = 'id orderPackageNumber orderLineItemIds orderPackageFulfillStatus errorMessage appId updatedAt trackingInfo { cargoCompany cargoCompanyId trackingNumber trackingLink barcode shippingLabelImage }';
  const ORDER_OPT = {
    salesChannelId: 'salesChannelId',
    orderPackageStatus: 'orderPackageStatus',
    orderPaymentStatus: 'orderPaymentStatus',
    customer: 'customer { firstName lastName email phone }',
    billingAddress: 'billingAddress { phone }',
    shippingAddress: 'shippingAddress { firstName lastName phone addressLine1 addressLine2 city { name } district { name } }',
    barcodeList: 'barcodeList',
    mainImageId: 'mainImageId',
    shippingLines: 'shippingLines { cargoCompanyId title }',
    cancelledAt: 'cancelledAt',
    updatedAt: 'updatedAt',
    orderPackages: `orderPackages { ${PKG_FIELDS} }`,
  };
  const orderQuery = (o, filter) => `query ($p: PaginationInput, $d: ${filter === 'id' ? 'StringFilterInput' : 'DateFilterInput'}) {
    listOrder(pagination: $p, ${filter}: $d) { hasNext data {
      id orderNumber orderedAt status totalFinalPrice currencyCode ${o.salesChannelId} ${o.orderPackageStatus} ${o.orderPaymentStatus} ${o.cancelledAt} ${o.updatedAt} ${o.shippingLines}
      ${o.customer} ${o.shippingAddress} ${o.billingAddress}
      orderLineItems { id quantity price finalPrice status variant { id productId sku name ${o.barcodeList} ${o.mainImageId} } }
      ${o.orderPackages}
    } }
  }`;

  function mapStatus(o) {
    const s = String(o.status || '').toUpperCase(), ps = String(o.orderPackageStatus || '').toUpperCase();
    if (/^(CANCELLED|CANCEL_REJECTED)$/.test(s) || ps === 'CANCELLED') return 'cancelled';
    if (/^REFUNDED$/.test(s) || /REFUNDED|RETURN/.test(ps)) return 'returned';
    if (ps === 'DELIVERED') return 'delivered';
    if (/FULFILLED|SHIPPED|UNABLE_TO_DELIVER/.test(ps) && !/^PARTIALLY|UNFULFILLED/.test(ps)) return 'shipped';
    if (/READY|PARTIALLY|PREPAR/.test(ps)) return 'processing';
    return 'new';
  }

  function normOrder(o) {
    const a = o.shippingAddress || {}, c = o.customer || {};
    const items = (o.orderLineItems || []).map((li) => {
      const v = li.variant || {};
      const unit = num(li.finalPrice ?? li.price);
      return {
        lineId: String(li.id), sku: str(v.sku), barcode: str((v.barcodeList || [])[0]), name: str(v.name),
        image: v.mainImageId ? imgUrl({ imageId: v.mainImageId, fileName: 'image' }) : '',
        quantity: num(li.quantity, 1), unitPrice: unit, total: unit * num(li.quantity, 1),
        status: /CANCEL|REFUND/i.test(li.status || '') ? 'cancelled' : '', remoteKey: str(v.id),
      };
    });
    // İptal / iade edilmiş paketler panelde gösterilmez (sipariş durumu ayrıca güncellenir)
    const packages = (o.orderPackages || []).filter((pk) => !/^(CANCELLED|REFUNDED|RETURN_|REFUND_REQUEST_ACCEPTED)/.test(pk.orderPackageFulfillStatus || '')).map((pk) => {
      const ti = pk.trackingInfo || {}, st = String(pk.orderPackageFulfillStatus || '');
      return {
        remoteId: String(pk.id),
        items: (pk.orderLineItemIds || []).map((lid) => ({ line_id: String(lid), qty: (items.find((i) => i.lineId === String(lid)) || {}).quantity || 1 })),
        status: /^(DELIVERED|FULFILLED|UNABLE_TO_DELIVER)$/.test(st) ? 'shipped' : 'open', remoteStatus: st,
        cargoCompany: str(ti.cargoCompany), tracking: str(ti.trackingNumber), barcode: str(ti.barcode), trackingUrl: str(ti.trackingLink),
        error: st === 'ERROR' ? str(pk.errorMessage) || 'ikas Kargo hata verdi' : '', labelReady: !!ti.shippingLabelImage,
        agreement: (ti.barcode || ti.trackingNumber) && (pk.appId || st === 'READY_FOR_SHIPMENT') ? 'ikas' : null,
      };
    });
    const first = packages.find((x) => x.tracking) || {};
    return {
      remoteId: String(o.id), orderNumber: String(o.orderNumber || o.id), orderedAt: typeof o.orderedAt === 'number' ? o.orderedAt : Date.parse(o.orderedAt),
      remoteStatus: [o.status, o.orderPackageStatus, o.orderPaymentStatus].filter(Boolean).join(' / '), status: mapStatus(o),
      customer: [a.firstName || c.firstName, a.lastName || c.lastName].filter(Boolean).join(' '), phone: str(a.phone || (o.billingAddress || {}).phone || c.phone), email: str(c.email),
      address: { name: [a.firstName, a.lastName].filter(Boolean).join(' '), line: [a.addressLine1, a.addressLine2].filter(Boolean).join(' '), district: str(a.district && a.district.name), city: str(a.city && a.city.name), phone: str(a.phone) },
      total: num(o.totalFinalPrice), currency: o.currencyCode || 'TRY',
      cargoCompany: first.cargoCompany || '', tracking: first.tracking || '',
      awaitingPayment: /WAITING/i.test(o.orderPaymentStatus || ''),
      cargoChoice: str(((o.shippingLines || [])[0] || {}).title), cargoChoiceId: str(((o.shippingLines || [])[0] || {}).cargoCompanyId),
      items, packages,
    };
  }

  // Görsel adresleri için mağaza (merchant) kimliği: girilmediyse API'den bir kez alınır
  async function ensureMerchant() {
    if (merchant || merchantTried) return merchant;
    merchantTried = true;
    try { const d = await gql('{ getMerchant { id } }'); merchant = (d.getMerchant && d.getMerchant.id) || ''; } catch { /* görselsiz devam */ }
    return merchant;
  }
  const imgUrl = (img, size = 180) => (merchant && img && img.imageId ? `https://cdn.myikas.com/images/${merchant}/${img.imageId}/${size}/${encodeURIComponent(String(img.fileName || 'image').replace(/\.[a-z0-9]+$/i, ''))}.webp` : '');

  // byOrdered: geçmiş sipariş aktarımında sipariş tarihine göre (normalde son güncellenme tarihine göre) çeker
  async function fetchOrders(since, until, { byOrdered = false } = {}) {
    await ensureMerchant();
    const out = [];
    let filter = byOrdered ? 'orderedAt' : 'updatedAt', optional = ORDER_OPT;
    for (let page = 1; page <= (byOrdered ? 60 : 20); page++) {
      let data;
      try {
        data = await flex((o) => orderQuery(o, filter), optional, { p: { page, limit: 50 }, d: { gte: since, lte: until } });
      } catch (e) {
        // Eski şemada updatedAt filtresi yoksa sipariş tarihine göre çek
        if (filter === 'updatedAt' && e.gql) { filter = 'orderedAt'; page--; continue; }
        throw e;
      }
      const r = data.listOrder;
      for (const o of r.data || []) {
        if (/DRAFT|WAITING_UPGRADE/i.test(o.status || '')) continue;
        if (salesChannel && o.salesChannelId && o.salesChannelId !== salesChannel) continue;
        out.push(normOrder(o));
      }
      if (!r.hasNext) break;
    }
    return out;
  }

  // Ürünler varyant düzeyinde gelir (her varyant = bir ilan = bir SKU). Varyant adı (ör. "5 Kg") ve görsel eklenir.
  async function fetchListings() {
    await ensureMerchant();
    const out = [];
    let values = new Map();
    try {
      const vt = await gql('{ listVariantType { id name values { id name } } }');
      for (const t of vt.listVariantType || []) for (const v of t.values || []) values.set(v.id, v.name);
    } catch { /* varyant adları olmadan devam */ }
    const q = (o) => `query ($page: Int!) { listProduct(pagination: { page: $page, limit: 100 }) { hasNext data {
      id name ${o.salesChannelIds} ${o.brand} ${o.description} variants { id sku ${o.barcodeList} isActive ${o.variantValueIds} prices { sellPrice discountPrice } stocks { stockCount } ${o.images} } } } }`;
    let optional = { barcodeList: 'barcodeList', images: 'images { imageId fileName isMain order isVideo }', salesChannelIds: 'salesChannelIds', variantValueIds: 'variantValueIds { variantTypeId variantValueId }', brand: 'brand { name }', description: 'description' };
    for (let page = 1; page <= 200; page++) {
      const d = await flex(q, optional, { page });
      for (const p of d.listProduct.data || []) {
        if (salesChannel && Array.isArray(p.salesChannelIds) && !p.salesChannelIds.includes(salesChannel)) continue;
        const vars = p.variants || [];
        // Ürün görseli: varyantın kendi görseli yoksa ürünün ana görseli
        const allImgs = vars.flatMap((v) => v.images || []).filter((i) => !i.isVideo && i.imageId);
        const mainImg = allImgs.find((i) => i.isMain) || allImgs.sort((a, b) => (a.order || 0) - (b.order || 0))[0];
        for (const v of vars) {
          const pr = (v.prices || [])[0] || {};
          const vi = (v.images || []).filter((i) => !i.isVideo && i.imageId);
          const img = vi.find((i) => i.isMain) || vi[0] || mainImg;
          const vname = (v.variantValueIds || []).map((x) => values.get(x.variantValueId)).filter(Boolean).join(' / ');
          out.push({
            remoteId: String(v.id), remoteProductId: String(p.id), sku: str(v.sku), barcode: str((v.barcodeList || [])[0]),
            name: vname ? `${p.name} - ${vname}` : p.name, groupName: p.name, variantName: vname,
            image: imgUrl(img, 360), price: num(pr.discountPrice || pr.sellPrice), listPrice: num(pr.sellPrice),
            stock: (v.stocks || []).reduce((s, x) => s + num(x.stockCount), 0), active: v.isActive !== false,
            brand: str(p.brand && p.brand.name), description: str(p.description),
          });
        }
      }
      if (!d.listProduct.hasNext) break;
    }
    return out;
  }

  async function location() {
    if (locationId) return locationId;
    const d = await gql('{ listStockLocation { id name } }');
    const l = (d.listStockLocation || [])[0];
    if (!l) throw new Error('ikas stok lokasyonu bulunamadı (' + p + 'STOCK_LOCATION_ID tanımlayın)');
    return (locationId = l.id);
  }

  async function pushStock(items) {
    const loc = await location();
    for (let i = 0; i < items.length; i += 100) {
      const part = items.slice(i, i + 100);
      await gql('mutation ($input: SaveStockLocationsInput!) { saveProductStockLocations(input: $input) }', {
        input: { productStockLocationInputs: part.map((x) => ({ productId: x.remoteProductId, variantId: x.remoteId, stockLocationId: loc, stockCount: x.stock })) },
      });
    }
  }

  async function pushPrice(items) {
    for (let i = 0; i < items.length; i += 100) {
      await gql('mutation ($input: SaveVariantPricesInput!) { saveVariantPrices(input: $input) }', {
        input: {
          variantPriceInputs: items.slice(i, i + 100).map((x) => ({
            productId: x.remoteProductId, variantId: x.remoteId,
            price: x.listPrice && x.listPrice > x.price ? { sellPrice: x.listPrice, discountPrice: x.price } : { sellPrice: x.price },
          })),
        },
      });
    }
  }

  // ---------- kargo (ikas Kargo) ----------
  // Resmi Admin API'de (2.1.0) ikas Kargo için ayrı "gönderi oluştur" işlemi yoktur. Gönderi şöyle oluşur:
  //   1) fulfillOrder(markAsReadyForShipment: true) → paket ikas'ta "Kargoya Hazır" (READY_FOR_SHIPMENT)
  //   2) ikas Kargo uygulaması paketi alır (paketin appId alanı dolar), anlaşmalı firmada gönderiyi açar ve
  //      barkod / takip no / etiket görselini paketin trackingInfo alanına yazar (hata olursa durum ERROR + errorMessage).
  // Panel bu adımları izler; ikas Kargo gerçek gönderiyi oluşturup etiketi vermeden "etiket hazır" demez.
  // ÖNEMLİ: paketlerken trackingInfoDetail (kargo firması / takip no) GÖNDERİLMEZ. Bu alan resmi şemada paketin dışarıdan
  // girilen takip bilgisidir; dolu gönderilirse ikas paketi "elle girilmiş kargo" sayar ve ikas Kargo o paketi işlemez.
  // Kargo firmasını ikas Kargo belirler (müşterinin ödeme sayfasında seçtiği kargo yöntemi / ikas'taki kargo ayarlarınız).
  let cargoCache = null;
  async function carriers() {
    if (!cargoCache) {
      const d = await gql('{ listCargoCompany { id name } }');
      cargoCache = (d.listCargoCompany || []).map((c) => ({ id: String(c.id), name: c.name })).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }
    return cargoCache;
  }
  // Kargo firması panelden seçilmez: ikas Kargo, siparişin kargo yöntemine göre kendisi seçer (bilgi amaçlı tek seçenek)
  async function cargoOptions(order) {
    const choice = order && order.extra && order.extra.cargoChoice;
    return [{ id: '', name: `ikas Kargo${choice ? ` — müşterinin seçtiği: ${choice}` : ''}`, hint: 'Firma ikas Kargo tarafından, siparişin kargo yöntemine ve ikas\'taki kargo ayarlarınıza göre belirlenir.', current: true }];
  }
  // Paket alanlarıyla dönen mutasyonlar: şemada olmayan alan hata verirse o alan çıkarılıp tekrar denenir
  let pkgFields = PKG_FIELDS;
  async function gqlPkg(build, variables) {
    for (;;) {
      try { return await gql(build(pkgFields), variables); } catch (e) {
        const f = e.gql && /cannot query field "(\w+)"/i.exec(e.message);
        const re = f && new RegExp(`\\s${f[1]}(\\s*\\{[^{}]*\\})?(?=[\\s}])`);
        if (!re || !re.test(' ' + pkgFields + ' ')) throw e;
        pkgFields = (' ' + pkgFields + ' ').replace(re, '').trim();
      }
    }
  }
  const FULFILL = (pf) => `mutation ($input: FulFillOrderInput!) { fulfillOrder(input: $input) { id orderPackages { ${pf} } } }`;

  // Tek siparişi kimliğiyle oku (etiket / barkod kontrolü için)
  async function getOrder(remoteId) {
    const d = await flex((o) => orderQuery(o, 'id'), ORDER_OPT, { p: { page: 1, limit: 1 }, d: { eq: remoteId } });
    const o = (d.listOrder.data || [])[0];
    if (!o) throw new Error('ikas: sipariş bulunamadı');
    return o;
  }

  // ikas paketinin gönderi durumu: kimin işlediği, gerçek gönderi oluştu mu, etiket var mı, hata ne
  function shipment(pk) {
    const ti = pk.trackingInfo || {}, st = String(pk.orderPackageFulfillStatus || '');
    const code = str(ti.barcode) || str(ti.trackingNumber);
    const base = { remoteId: String(pk.id), remoteStatus: st, barcode: str(ti.barcode), tracking: str(ti.trackingNumber), cargoCompany: str(ti.cargoCompany), appId: str(pk.appId) };
    if (st === 'ERROR') return { ...base, state: 'error', error: `ikas Kargo gönderiyi oluşturamadı: ${str(pk.errorMessage) || 'sebep bildirilmedi'}` };
    // "Kargoya Hazır" pakete barkodu yazan ikas Kargo'dur (ya da paketi işleyen kargo uygulaması: appId)
    if (code && (pk.appId || st === 'READY_FOR_SHIPMENT')) return { ...base, state: ti.shippingLabelImage ? 'labeled' : 'created', agreement: 'ikas', labelImage: ti.shippingLabelImage || '' };
    if (code) return { ...base, state: 'manual', labelImage: ti.shippingLabelImage || '' }; // takip no elle girilip gönderilmiş
    // Kargoya Hazır ama elle kargo firması yazılmış (eski panel sürümü / ikas'ta elle giriş): ikas Kargo bu paketi işlemez
    if (st === 'READY_FOR_SHIPMENT' && !pk.appId && (ti.cargoCompanyId || ti.cargoCompany)) return { ...base, state: 'manualCargo' };
    if (st === 'READY_FOR_SHIPMENT') return { ...base, state: 'waiting' };
    return { ...base, state: 'none' };
  }

  // Paketle = ikas Kargo ile gönderime hazırla: paket "Kargoya Hazır" oluşturulur, ikas Kargo gönderiyi açar
  async function pack(order, pkgs) {
    const out = [];
    for (const pkg of pkgs) {
      const lines = pkg.items.map((x) => ({ orderLineItemId: String(x.line_id), quantity: x.qty }));
      // Yalnızca "Kargoya Hazır": takip bilgisi gönderilmez (gönderilirse ikas Kargo paketi işlemez, bkz. yukarı)
      const d = await gqlPkg(FULFILL, { input: { orderId: order.remote_id, lines, markAsReadyForShipment: true, sendNotificationToCustomer: false } });
      const pks = ((d.fulfillOrder || {}).orderPackages || []).filter((x) => !/CANCEL|REFUND/.test(x.orderPackageFulfillStatus || ''));
      const pk = pks.filter((x) => (x.orderLineItemIds || []).some((l) => lines.some((y) => y.orderLineItemId === String(l)))).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
      if (!pk) throw new Error('ikas paketi oluşturdu ama paket bilgisi dönmedi; birazdan senkronlayın');
      const sh = shipment(pk);
      if (sh.state === 'none') throw new Error(`ikas paketi "Kargoya Hazır" yapmadı (durum: ${sh.remoteStatus || 'bilinmiyor'}); ikas Kargo gönderisi başlamadı`);
      out.push({ ...sh, cargoCompany: sh.cargoCompany || '', error: sh.error || '' });
    }
    return { packages: out, message: `${out.length} paket ikas'ta “Kargoya Hazır” yapıldı; ikas Kargo gönderiyi oluşturuyor` };
  }

  // Etiket: yalnızca ikas Kargo'nun gerçek gönderisi ve etiketi. Gönderi henüz oluşmadıysa "bekleniyor", hata varsa sebebi.
  async function label(order, pkg) {
    if (!pkg.remote_id) return { pending: 'Bu sipariş ikas\'ta henüz paketlenmemiş. ikas panelinde paketleyip ikas Kargo ile gönderin; oluşan barkod ve etiket senkronla buraya gelir.' };
    const o = await getOrder(order.remote_id);
    const pk = (o.orderPackages || []).find((x) => String(x.id) === String(pkg.remote_id));
    if (!pk) throw new Error('Paket ikas\'ta bulunamadı (ikas panelinden iptal edilmiş olabilir); senkronlayın');
    const sh = shipment(pk);
    const info = { barcode: sh.barcode, tracking: sh.tracking, cargoCompany: sh.cargoCompany, remoteStatus: sh.remoteStatus, agreement: sh.agreement || null, step: sh.state };
    if (sh.state === 'error') throw new Error(sh.error + ' — müşteri telefonu, gönderici (depo) adresi ve ikas Kargo\'daki firma anlaşmasını kontrol edin.');
    if (sh.labelImage) {
      const lab = await labelFrom(sh.labelImage, `ikas-${order.order_number}-${pkg.no}`);
      if (lab) return { ...info, label: lab };
    }
    if (sh.state === 'created') return { ...info, pending: `ikas Kargo gönderiyi oluşturdu (${sh.cargoCompany || 'kargo'} · barkod ${sh.barcode || sh.tracking}) ama etiket görselini henüz vermedi. Birkaç saniye sonra tekrar deneyin.`, barcodeOnly: true };
    if (sh.state === 'manual') return { ...info, pending: 'Bu pakete takip numarası elle girilmiş; ikas Kargo gönderisi değil, ikas etiket vermez.', barcodeOnly: true };
    if (sh.state === 'manualCargo') return { ...info, pending: `Bu paket ikas'a elle kargo bilgisiyle (${sh.cargoCompany || 'firma'}) kaydedilmiş; ikas Kargo böyle paketleri işlemez ve barkod üretmez. “ikas Kargo ile yeniden hazırla” paketi ikas'ta iptal edip takip bilgisi olmadan yeniden Kargoya Hazır yapar.`, repack: true };
    if (sh.state === 'waiting') return { ...info, pending: 'Paket “Kargoya Hazır”; ikas Kargo henüz gönderiyi oluşturmadı (barkod yok). ikas Kargo otomatik göndermiyorsa ikas panelinde siparişte “ikas Kargo ile Gönder”e basın; barkod ve etiket buraya kendiliğinden gelir.' };
    return { ...info, pending: `Paket ikas Kargo'ya gönderilmedi (durum: ${sh.remoteStatus || '-'})` };
  }

  // Kargoya ver: ikas Kargo paketi zaten varsa "Gönderildi" (FULFILLED) yapılır; yoksa takip bilgisiyle gönderilir
  async function ship(order, pkg, { cargoCompany, tracking }) {
    if (pkg.remote_id) {
      await gql('mutation ($input: UpdateOrderPackageStatusInput!) { updateOrderPackageStatus(input: $input) { id } }', {
        input: { orderId: order.remote_id, packages: [{ packageId: pkg.remote_id, status: 'FULFILLED', trackingInfo: tracking && tracking !== pkg.tracking && tracking !== pkg.barcode ? { trackingNumber: tracking, cargoCompany: cargoCompany || undefined, isSendNotification: true } : undefined }] },
      });
      return { remoteId: pkg.remote_id };
    }
    const lines = pkg.items.map((x) => ({ orderLineItemId: String(x.line_id), quantity: x.qty }));
    const d = await gqlPkg(FULFILL, { input: { orderId: order.remote_id, lines, sendNotificationToCustomer: true, trackingInfoDetail: tracking ? { cargoCompany: cargoCompany || '', trackingNumber: tracking, isSendNotification: true } : undefined } });
    const pk = ((d.fulfillOrder || {}).orderPackages || []).find((x) => (x.orderLineItemIds || []).some((l) => lines.some((y) => y.orderLineItemId === String(l))));
    return { remoteId: pk ? String(pk.id) : null };
  }

  // Paketi iptal et (ikas'ta paketlemeyi geri al) — kargo firmasını değiştirmek veya yeniden bölmek için
  async function cancelPackage(order, pkg) {
    if (!pkg.remote_id) return;
    await gql('mutation ($input: CancelFulfillmentInput!) { cancelFulfillment(input: $input) { id } }', { input: { orderId: order.remote_id, orderPackageId: pkg.remote_id } });
  }
  // Kargo firması değiştir: barkod oluşmadan önce paket iptal edilip seçilen firmayla yeniden "Kargoya Hazır" yapılır
  // ikas Kargo ile yeniden hazırla: elle kargo bilgisiyle oluşmuş (ya da takılmış) paketi iptal edip takip bilgisi olmadan yeniden "Kargoya Hazır" yapar
  async function repack(order, pkg) {
    if (pkg.barcode || pkg.tracking) throw new Error('Bu pakette kargo barkodu var; yeniden hazırlamak gönderiyi geçersiz kılar. Gerekirse önce ikas panelinden gönderiyi iptal edin.');
    if (pkg.remote_id) await cancelPackage(order, pkg);
    const r = await pack(order, [pkg]);
    return r.packages[0];
  }

  async function createProduct(pr) {
    const d = await gql('mutation ($input: ProductInput!) { saveProduct(input: $input) { id variants { id } } }', {
      input: {
        name: pr.name, type: 'PHYSICAL', description: pr.description || '',
        salesChannelIds: salesChannel ? [salesChannel] : undefined,
        variants: [{ sku: pr.sku || undefined, barcodeList: pr.barcode ? [pr.barcode] : [], isActive: true, prices: [{ sellPrice: pr.sale_price }] }],
      },
    });
    const prod = d.saveProduct, v = (prod.variants || [])[0];
    const listing = { remoteId: String(v.id), remoteProductId: String(prod.id), sku: pr.sku, barcode: pr.barcode, name: pr.name, price: pr.sale_price, stock: 0 };
    await pushStock([{ ...listing, stock: Math.max(0, pr.stock) }]);
    return { ...listing, stock: Math.max(0, pr.stock) };
  }

  // ---------- tanılama ----------
  // Her adımı ayrı ayrı ikas'a sorar ve sonucu açıklar: bağlantı, uygulama izinleri, depo adresi, kargo ayarları,
  // ve (sipariş verilirse) o siparişin paketleri: durum, ikas Kargo uygulaması işledi mi, barkod / etiket / hata.
  async function diagnose({ orderId } = {}) {
    const out = [];
    const step = async (name, fn) => {
      try { const r = await fn(); out.push({ name, ...r }); return r; } catch (e) { out.push({ name, ok: false, detail: e.message }); return null; }
    };
    const tok = await step('ikas bağlantısı (OAuth)', async () => { await auth(); return { ok: true, detail: `${store}.myikas.com için erişim anahtarı alındı` }; });
    if (!tok) return out;
    // İzinler: resmi adlar read_/write_ + orders, products, inventories (ikas OAuth). Önce erişim anahtarının izin listesi,
    // yoksa uygulama kaydı. ikas listeyi boş döndürürse "eksik" denmez; izinler aşağıdaki gerçek işlemlerle doğrulanır.
    await step('Uygulama izinleri', async () => {
      let sc = tokenScope;
      if (!sc) { try { sc = String(((await gql('{ getAuthorizedApp { scope } }')).getAuthorizedApp || {}).scope || ''); } catch { /* okunamadı */ } }
      const have = new Set(sc.toLowerCase().split(/[\s,;]+/).filter(Boolean));
      if (!have.size) return { ok: null, detail: 'ikas izin listesini bildirmedi (özel uygulamalarda olağan). İzinler aşağıdaki adımlarda gerçek işlemlerle kontrol edilir: siparişler okunabiliyorsa okuma izni vardır; paketleme hatasında ikas yazma izni eksikse bunu açıkça söyler.' };
      const need = [['read_orders', 'Siparişler – Görüntüleme', true], ['write_orders', 'Siparişler – Düzenleme (paketleme / Kargoya Hazır)', true], ['read_products', 'Ürünler – Görüntüleme', true], ['write_products', 'Ürünler – Düzenleme (fiyat gönderimi)', false], ['read_inventories', 'Envanter – Görüntüleme (depo adresi)', false], ['write_inventories', 'Envanter – Düzenleme (stok gönderimi)', false]];
      const miss = need.filter(([k]) => !have.has(k));
      return { ok: miss.some((x) => x[2]) ? false : miss.length ? null : true, detail: `${miss.length ? `Kapalı izin: ${miss.map((x) => x[1]).join(', ')}. ` : 'Gerekli izinler açık. '}(ikas: ${[...have].join(', ')})` };
    });
    await step('Mağaza (görseller için)', async () => { const d = await gql('{ getMerchant { id } }'); return { ok: !!(d.getMerchant && d.getMerchant.id), detail: `Merchant ID: ${(d.getMerchant || {}).id || '-'}` }; });
    await step('Depo / stok lokasyonu adresi', async () => {
      const d = await gql('{ listStockLocation { id name type address { address phone postalCode city { name } district { name } } } }');
      const locs = d.listStockLocation || [];
      if (!locs.length) return { ok: false, detail: 'Stok lokasyonu yok. ikas → Ayarlar → Stok Lokasyonları' };
      const bad = locs.filter((l) => { const a = l.address || {}; return !a.address || !(a.city && a.city.name) || !(a.district && a.district.name) || !a.phone; });
      return { ok: bad.length ? false : true, detail: locs.map((l) => { const a = l.address || {}; return `${l.name}${l.id === locationId ? ' (stok buraya gönderiliyor)' : ''}: ${[a.address, a.district && a.district.name, a.city && a.city.name, a.phone].filter(Boolean).join(', ') || 'ADRES YOK'}`; }).join(' · ') + (bad.length ? ' — ikas Kargo barkod üretmek için gönderici adresi (adres, il, ilçe, telefon) eksiksiz olmalı.' : '') };
    });
    await step('Kargo firmaları (ikas)', async () => { const c = await carriers(); return { ok: c.length ? true : null, detail: c.map((x) => x.name).join(', ') || 'ikas kargo firması listesi boş' }; });
    await step('Kargo ayarları (bölgeler)', async () => {
      const d = await gql('{ listShippingSettings { zoneName isPassive salesChannelId type zoneRate { rateName cargoCompanyId price } } }');
      const list = (d.listShippingSettings || []).filter((x) => !x.isPassive);
      const names = new Map((cargoCache || []).map((c) => [c.id, c.name]));
      return { ok: list.length ? true : null, detail: list.map((x) => `${x.zoneName}: ${(x.zoneRate || []).map((r) => `${r.rateName}${r.cargoCompanyId ? ` → ${names.get(r.cargoCompanyId) || r.cargoCompanyId}` : ' (kargo firması bağlı değil)'}`).join(', ')}`).join(' · ') || 'Aktif kargo ayarı yok' };
    });
    if (orderId) {
      await step('Sipariş ve paketleri (ikas)', async () => {
        const o = await getOrder(orderId);
        const a = o.shippingAddress || {}, bill = o.billingAddress || {}, cu = o.customer || {};
        const phone = a.phone || bill.phone || cu.phone;
        const phoneSrc = a.phone ? 'teslimat adresi' : bill.phone ? 'fatura adresi (teslimat adresinde yok)' : cu.phone ? 'müşteri kaydı (teslimat adresinde yok)' : '';
        const sl = (o.shippingLines || [])[0] || {};
        const names = new Map((await carriers().catch(() => [])).map((c) => [c.id, c.name]));
        const chosen = sl.cargoCompanyId ? names.get(String(sl.cargoCompanyId)) || sl.cargoCompanyId : '';
        let inSettings = null;
        try {
          const d = await gql('{ listShippingSettings { isPassive zoneRate { cargoCompanyId } } }');
          const ids = new Set((d.listShippingSettings || []).filter((x) => !x.isPassive).flatMap((x) => (x.zoneRate || []).map((r) => String(r.cargoCompanyId || ''))));
          if (sl.cargoCompanyId) inSettings = ids.has(String(sl.cargoCompanyId));
        } catch { /* ayarlar okunamadı */ }
        const pk = o.orderPackages || [];
        const lines = [`Sipariş #${o.orderNumber} · durum ${o.status} / ${o.orderPackageStatus || '-'}`,
          `Müşterinin ödeme sayfasında seçtiği kargo: ${sl.title || '-'}${chosen ? ` → ${chosen}` : ' (kargo firmasına bağlı değil)'}${inSettings === false ? ' · ⚠ bu firma aktif kargo ayarlarınızda yok' : ''}`,
          `Alıcı telefonu: ${phone ? `${phone} (${phoneSrc})` : 'YOK (teslimat, fatura ve müşteri kaydında)'}`];
        let ok = true;
        if (!phone) { ok = false; lines.push('⚠ Alıcı telefonu yok: kargo firması gönderi açmaz. ikas\'ta siparişin teslimat adresine telefon ekleyin.'); }
        else if (!a.phone) lines.push('⚠ Telefon teslimat adresinde değil; bazı kargo firmaları yalnızca teslimat adresindeki telefonu kabul eder. ikas\'ta teslimat adresine telefonu ekleyin.');
        if (!pk.length) { ok = null; lines.push('Paket yok: panelden “Paketle ve etiket al” yapılmamış ya da paket ikas\'ta iptal edilmiş.'); }
        for (const x of pk) {
          const ti = x.trackingInfo || {};
          lines.push(`Paket ${x.orderPackageNumber || x.id}: ${x.orderPackageFulfillStatus}${x.appId ? ` · işleyen uygulama ${x.appId}` : ' · hiçbir kargo uygulaması işlememiş'} · kargo ${ti.cargoCompany || '-'} · barkod ${ti.barcode || '-'} · takip ${ti.trackingNumber || '-'} · etiket görseli ${ti.shippingLabelImage ? 'VAR' : 'yok'}${x.errorMessage ? ` · HATA: ${x.errorMessage}` : ''}`);
          if (x.orderPackageFulfillStatus === 'ERROR') ok = false;
          if (x.orderPackageFulfillStatus === 'READY_FOR_SHIPMENT' && !x.appId && !ti.barcode && !ti.trackingNumber && (ti.cargoCompanyId || ti.cargoCompany)) { ok = false; lines.push(`⚠ Bu pakete elle kargo firması (${ti.cargoCompany || ti.cargoCompanyId}) yazılmış: ikas bunu “kendi kargonuzla gönderim” sayar, ikas Kargo barkod üretmez. Panelde paketin menüsünden “ikas Kargo ile yeniden hazırla”yı kullanın.`); continue; }
          if (ti.cargoCompanyId && sl.cargoCompanyId && String(ti.cargoCompanyId) !== String(sl.cargoCompanyId)) lines.push(`Not: paket ${ti.cargoCompany || ti.cargoCompanyId} firmasına, müşteri ise ${chosen || sl.title} seçmiş.`);
          if (x.orderPackageFulfillStatus === 'READY_FOR_SHIPMENT' && !ti.barcode && !ti.trackingNumber && !x.errorMessage) {
            ok = false;
            lines.push(`⚠ Paket “Kargoya Hazır” ama ikas Kargo gönderiyi açmamış (barkod yok). Panel kendi başına barkod üretemez; barkodu ikas Kargo, ${chosen || 'seçilen firma'} anlaşmanızla üretir. Kontrol: (1) ikas → Ayarlar → Kargo / ikas Kargo'da ${chosen || 'bu firma'} anlaşması aktif mi, (2) gönderim “Kargoya Hazır olunca otomatik” mi, (3) aynı siparişi ikas panelinde açıp ikas Kargo ile barkod oluşturmayı deneyin: ikas panelinde de oluşmuyorsa sorun ikas Kargo hesabı/anlaşmasındadır; ikas panelinde oluşuyor, panelde oluşmuyorsa bu raporu iletin.`);
          }
        }
        return { ok, detail: lines.join('\n') };
      });
    }
    return out;
  }

  const missing = [p + 'STORE', p + 'CLIENT_ID', p + 'CLIENT_SECRET'].filter((k) => !env[k]);
  return {
    ...meta, type: 'ikas', enabled: !missing.length, missing,
    caps: { accept: 'local', split: 'local', pack: 'remote', ship: 'remote', label: 'remote', cargo: false, repack: true, cancelPackage: true, createProduct: true, price: true },
    fetchOrders, fetchListings, pushStock, pushPrice, ship, createProduct, cargoOptions, pack, label, cancelPackage, repack, diagnose,
  };
}
