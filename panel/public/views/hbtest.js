// Hepsiburada canlıya geçiş testi (SIT): Hepsiburada'nın istediği üç adım bu sayfadan yapılır.
// 1) Ürün gönderme → trackingId · 2) Envanterdeki üründe stok + fiyat → yükleme kimlikleri · 3) Test siparişi → listeleme + paketleme
// Sonuçlar saklanır; en altta Hepsiburada'ya açılacak talep için hazır özet metni vardır.
import { api, html, render, $, $$, money, dateTime, actions, busy, toast, confirmBox, debounce, statusPill } from '../core.js';

const pretty = (o) => JSON.stringify(o, null, 2);
const BASE_MAP = { merchantSku: 'sku', VaryantGroupID: 'group', Barcode: 'barcode', UrunAdi: 'name', UrunAciklamasi: 'description', Marka: 'brand', price: 'price', stock: 'stock', Image1: 'image', tax_vat_rate: 'vat', GarantiSuresi: 'warranty', kg: 'desi' };

export async function hbTestView(el) {
  let st = null, cat = null, attrs = [], prod = null, sel = null;
  const resultBox = (r) => html`<pre class="code-box">${typeof r === 'string' ? r : pretty(r)}</pre>`;
  async function load() {
    st = await api('hbtest/state');
    draw();
  }
  function summaryText(r) {
    return [`Merchant ID: ${st.merchantId}`, `1) Ürün entegrasyonu – trackingId: ${r.trackingId || '-'}`,
      `2) Listeleme – stok yükleme id: ${r.stockUploadId || '-'} · fiyat yükleme id: ${r.priceUploadId || '-'} (ürün ${r.listingSku || '-'}, stok ${r.stock ?? '-'}, fiyat ${r.price ?? '-'})`,
      `3) Sipariş – test siparişi: ${r.testOrder || '-'} · API ile listelendi ve paketlendi, paket no: ${r.packageNumber || '-'}`].join('\n');
  }
  function draw() {
    const r = st.results || {};
    render(el, html`<div class="stack" style="max-width:1000px">
      <div class="notice ${st.ready && st.test ? '' : 'warn'}"><i class="ico ico-${st.ready && st.test ? 'check' : 'warn'}"></i><div style="flex:1">
        ${!st.ready ? html`<b>Önce bağlantı:</b> Entegrasyonlar → Hepsiburada: Merchant ID, Servis anahtarı (Secret key), Entegratör adı (User-Agent) ve <b>Ortam = Test (SIT)</b>. Kaydedip “Bağlantıyı test et”e basın.${st.missing.length ? ` Eksik: ${st.missing.join(', ')}` : ''}`
          : st.test ? html`<b>Test (SIT) ortamına bağlı</b> · Merchant ${st.merchantId}. Aşağıdaki üç adımı sırayla tamamlayın; sonuçlar en altta toplanır.`
            : html`<b>Dikkat: canlı ortama bağlısınız.</b> Test adımları için Entegrasyonlar → Hepsiburada → Ortam = Test (SIT) seçin.`}</div><a class="btn sm" href="#/entegrasyonlar">Entegrasyonlar</a></div>

      <div class="card stack" style="border-color:var(--primary)">
        <div class="card-head" style="margin:0"><h2>Panelden 520 hatası alınıyorsa: bilgisayarınızdan çalıştırın</h2></div>
        <p class="small" style="margin:0">Hepsiburada'nın test sunucuları, panelin çalıştığı Cloudflare sunucularından gelen sipariş/listeleme isteklerine <b>520</b> veriyor. Aşağıdaki araç aynı üç adımı <b>kendi internet bağlantınızdan</b> yapar ve Hepsiburada'ya iletilecek özeti hazırlar (bilgiler hiçbir yere kaydedilmez).</p>
        <ol class="small" style="margin:0;padding-left:20px;line-height:1.8">
          <li><a class="btn sm primary" href="/hb-sit-test.ps1" download="hb-sit-test.ps1"><i class="ico ico-download"></i>Test aracını indir (Windows)</a></li>
          <li>İndirilen <b>hb-sit-test.ps1</b> dosyasına sağ tıklayın → <b>PowerShell ile çalıştır</b>. (Açılmazsa: Başlat → PowerShell → <code>powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\\Downloads\\hb-sit-test.ps1"</code>)</li>
          <li>Hepsiburada'nın test e-postasındaki <b>Merchant ID</b>, <b>servis anahtarı</b> ve <b>entegratör adını</b> girin; kategori, ürün sorularında Enter'a basmanız yeterli.</li>
          <li>Sonunda çıkan özet panoya kopyalanır ve Masaüstü'ne kaydedilir: Hepsiburada'ya açacağınız talebe yapıştırın.</li>
        </ol>
        <p class="small" style="margin:0"><b>Kalıcı çözüm (aracı sunucu):</b> panelin Hepsiburada isteklerini Cloudflare dışındaki bir sunucudan geçirir; test adımları da canlı kullanım da panelden çalışır. İki yoldan biri yeterli:</p>
        <ul class="small" style="margin:0;padding-left:20px;line-height:1.8">
          <li><b>Hosting gerekmez (ücretsiz):</b> <a class="link" href="/hb-proxy-deno.js" download="hb-proxy-deno.js">hb-proxy-deno.js</a> — deno.com/deploy'da GitHub hesabıyla Playground açıp yapıştırın, içindeki KEY'i değiştirip yayınlayın (adımlar dosyanın başında).</li>
          <li><b>Hostinginiz varsa:</b> <a class="link" href="/hb-proxy.php" download="hb-proxy.php">hb-proxy.php</a> — $KEY'i değiştirip public_html'e yükleyin.</li>
        </ul>
        <p class="small" style="margin:0">Sonra Entegrasyonlar → Hepsiburada → Gelişmiş ayarlar → <b>Aracı sunucu adresi</b> ve <b>anahtarı</b> → Kaydet → Bağlantıyı test et.</p>
        <p class="tiny muted" style="margin:0">Araçtaki “Bağlantı kontrolü” bilgisayarınızdan da 520 / 401 veriyorsa sorun hesap tanımındadır; o çıktıyı Hepsiburada'ya iletin.</p>
      </div>

      <div class="card stack" data-step="1">
        <div class="card-head" style="margin:0"><h2>1) Ürün entegrasyonu (katalog) ${r.trackingId ? html`<span class="pill good">trackingId alındı</span>` : ''}</h2></div>
        <p class="muted small" style="margin:0">Panelden bir ürün seçin, Hepsiburada kategorisini bulun; kategori özellikleri gelir, zorunluları doldurup gönderin. Oluşan <b>trackingId</b> Hepsiburada'ya iletilir (testte onay beklenmez, hatasız gönderim yeterlidir).</p>
        <div class="form-grid">
          <label class="field"><span>Panel ürünü</span><input class="input" data-pq placeholder="Ürün adı / SKU ara"><div data-plist class="stack" style="gap:4px;margin-top:4px"></div></label>
          <label class="field"><span>Hepsiburada kategorisi</span><input class="input" data-cq placeholder="ör. gübre, toprak, tohum"><div data-clist class="stack" style="gap:4px;margin-top:4px"></div></label>
        </div>
        <div data-attrs></div>
        ${r.trackingId ? html`<div class="row wrap"><span>trackingId: <b class="num">${r.trackingId}</b></span><button class="btn sm" data-act="pstatus">Durumu sorgula</button></div>` : ''}
        <div data-out1></div>
      </div>

      <div class="card stack" data-step="2">
        <div class="card-head" style="margin:0"><h2>2) Listeleme: stok ve fiyat ${r.stockUploadId ? html`<span class="pill good">gönderildi</span>` : ''}</h2></div>
        <p class="muted small" style="margin:0">Hepsiburada'nın test hesabınıza yüklediği envanterdeki bir ürünle yapılmalıdır. “Envanteri çek” ile ürünleri alın, birini seçip stok ve fiyat gönderin.</p>
        <div class="row wrap"><button class="btn" data-act="inv"><i class="ico ico-download"></i>Envanteri çek (${st.listings.length})</button></div>
        ${st.listings.length ? html`<div class="table-wrap" style="max-height:260px;overflow:auto"><table class="t"><thead><tr><th></th><th>Ürün</th><th>HB SKU</th><th>Satıcı SKU</th><th class="r">Fiyat</th><th class="r">Stok</th></tr></thead><tbody>
          ${st.listings.map((l) => html`<tr><td><input type="radio" name="hbl" value="${l.remote_id}" data-msku="${l.sku || ''}" data-price="${l.price || ''}" data-stock="${l.remote_stock ?? ''}" ${r.listingSku === l.remote_id ? 'checked' : ''}></td><td class="ellipsis" style="max-width:280px">${l.name}</td><td class="num">${l.remote_id}</td><td>${l.sku || ''}</td><td class="r num">${money(l.price)}</td><td class="r num">${l.remote_stock ?? '—'}</td></tr>`)}
        </tbody></table></div>
        <div class="row wrap"><label class="field" style="flex:0 0 140px"><span>Stok</span><input class="input" data-lstock inputmode="numeric" value="${r.stock ?? 10}"></label><label class="field" style="flex:0 0 160px"><span>Fiyat (₺)</span><input class="input" data-lprice inputmode="decimal" value="${r.price ?? ''}"></label><button class="btn primary" data-act="listing" style="align-self:flex-end">Stok ve fiyat gönder</button></div>` : ''}
        ${r.stockUploadId ? html`<div class="row wrap small"><span>Stok yükleme: <b class="num">${r.stockUploadId}</b></span><button class="btn sm" data-act="ustatus" data-k="stock" data-id="${r.stockUploadId}">Durum</button><span>Fiyat yükleme: <b class="num">${r.priceUploadId}</b></span><button class="btn sm" data-act="ustatus" data-k="price" data-id="${r.priceUploadId}">Durum</button></div>` : ''}
        <div data-out2></div>
      </div>

      <div class="card stack" data-step="3">
        <div class="card-head" style="margin:0"><h2>3) Sipariş entegrasyonu ${r.packageNumber ? html`<span class="pill good">paketlendi</span>` : r.testOrder ? html`<span class="pill warn">sipariş oluştu</span>` : ''}</h2></div>
        <p class="muted small" style="margin:0">Test siparişi Hepsiburada'nın test servisine gönderilir. Gövde, envanterden seçtiğiniz ürünle doldurulur; Hepsiburada'nın “Test Siparişi Oluşturma” dokümanındaki alanlarla farklıysa buradan düzeltebilirsiniz. Sonra “Siparişleri çek” → sipariş panelde görünür → <b>Siparişler</b>'de açıp “Paketle”.</p>
        <textarea class="input" data-obody style="min-height:260px;font-family:ui-monospace,monospace;font-size:12px"></textarea>
        <div class="row wrap"><button class="btn" data-act="otpl">Şablonu seçili ürünle doldur</button><button class="btn primary" data-act="order">Test siparişi oluştur</button><span class="spacer"></span><button class="btn" data-act="osync"><i class="ico ico-sync"></i>Siparişleri çek</button></div>
        ${st.orders.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Sipariş</th><th>Durum</th><th>Tarih</th><th class="r">Tutar</th><th>Paket</th><th></th></tr></thead><tbody>
          ${st.orders.map((o) => html`<tr><td class="num">${o.order_number}</td><td>${statusPill(o.status)}</td><td class="small">${dateTime(o.ordered_at)}</td><td class="r num">${money(o.total)}</td><td class="num small">${o.packages || html`<span class="muted">paketlenmedi</span>`}</td><td class="r"><a class="btn sm" href="#/siparisler/${encodeURIComponent(o.id)}">${o.packages ? 'Aç' : 'Aç ve paketle'}</a></td></tr>`)}
        </tbody></table></div>` : ''}
        <div data-out3></div>
      </div>

      <div class="card stack">
        <h2>Hepsiburada'ya iletilecek özet</h2>
        <textarea class="input" readonly style="min-height:110px;font-family:ui-monospace,monospace;font-size:12.5px" data-sum>${summaryText(r)}</textarea>
        <div class="row wrap"><button class="btn primary" data-act="copy"><i class="ico ico-copy"></i>Özeti kopyala</button><span class="muted small">Üç adım tamamlanınca bu metinle Hepsiburada'da yeni talep (ticket) açın.</span><span class="spacer"></span><button class="btn ghost danger" data-act="cleanup">Test verilerini temizle</button></div>
      </div>
    </div>`);
    $('[data-obody]', el).value = orderTemplate();
    wire();
  }
  const selected = () => { const x = $('input[name=hbl]:checked', el); return x ? { hbSku: x.value, merchantSku: x.dataset.msku, price: Number(x.dataset.price) || 100 } : null; };
  function orderTemplate() {
    const s = selected() || { hbSku: 'HBV0000XXXXXX', price: 100 };
    const id = String(Date.now()).slice(-9), now = new Date().toISOString();
    return pretty({
      OrderNumber: '9' + id, OrderDate: now,
      Customer: { CustomerId: crypto.randomUUID(), Name: 'Test Müşteri' },
      DeliveryAddress: { AddressId: crypto.randomUUID(), Name: 'Test Müşteri', AddressDetail: 'Test Mahallesi Deneme Sokak No:1', Email: 'test@example.com', CountryCode: 'TR', PhoneNumber: '05555555555', AlternatePhoneNumber: '', Town: 'Kadıköy', District: 'Caferağa', City: 'İstanbul' },
      LineItems: [{ Sku: s.hbSku, MerchantId: st.merchantId, Quantity: 1, Price: { Amount: s.price, Currency: 'TRY' }, Vat: 0, TotalPrice: { Amount: s.price, Currency: 'TRY' }, CargoCompanyId: 89100, DeliveryOptionId: 1 }],
    });
  }
  function wire() {
    const pq = $('[data-pq]', el), cq = $('[data-cq]', el);
    pq.addEventListener('input', debounce(async () => {
      const r = await api('products?limit=8&q=' + encodeURIComponent(pq.value.trim()));
      render($('[data-plist]', el), html`${r.products.map((p) => html`<button class="cand" style="text-align:left" data-act="pick" data-id="${p.id}"><span style="flex:1"><b>${p.name}</b><div class="tiny muted">${p.sku || ''} · ${p.barcode || ''}</div></span></button>`)}`);
      $$('[data-act=pick]', el).forEach((b) => { b.onclick = async () => { prod = await api('products/' + b.dataset.id); render($('[data-plist]', el), html`<div class="small">Seçili: <b>${prod.name}</b></div>`); drawAttrs(); }; });
    }, 300));
    cq.addEventListener('input', debounce(async () => {
      const q = cq.value.trim(); if (q.length < 2) return;
      try {
        const r = await api('hbtest/categories?q=' + encodeURIComponent(q));
        render($('[data-clist]', el), html`${r.items.slice(0, 12).map((c) => html`<button class="cand" style="text-align:left" data-act="cpick" data-id="${c.id}" data-name="${c.name}"><span style="flex:1"><b>${c.name}</b><div class="tiny muted">${c.path || ''} · ${c.id}</div></span></button>`)}${!r.items.length ? html`<div class="muted small">Bulunamadı (${r.total} kategori tarandı)</div>` : ''}`);
        $$('[data-act=cpick]', el).forEach((b) => { b.onclick = () => busy(b, async () => { cat = { id: b.dataset.id, name: b.dataset.name }; attrs = (await api('hbtest/attributes?category=' + cat.id)).attributes; render($('[data-clist]', el), html`<div class="small">Seçili: <b>${cat.name}</b> (${cat.id}) · ${attrs.length} özellik</div>`); drawAttrs(); }); });
      } catch (e) { render($('[data-clist]', el), html`<div class="notice bad small">${e.message}</div>`); }
    }, 400));
  }
  function defaultFor(a) {
    if (!prod) return '';
    const k = BASE_MAP[a.id];
    if (k === 'sku') return prod.sku || ''; if (k === 'group') return prod.group_name || prod.sku || ''; if (k === 'barcode') return prod.barcode || '';
    if (k === 'name') return prod.name || ''; if (k === 'description') return prod.description || prod.name || ''; if (k === 'brand') return prod.brand || '';
    if (k === 'price') return String(prod.sale_price || '').replace('.', ','); if (k === 'stock') return String(Math.max(0, prod.stock || 0)); if (k === 'image') return prod.image || '';
    if (k === 'vat') return String(prod.vat ?? 20); if (k === 'warranty') return '0'; if (k === 'desi') return String(prod.desi || 1);
    return '';
  }
  function drawAttrs() {
    if (!cat || !prod) { render($('[data-attrs]', el), html`<div class="muted small">${!prod ? 'Ürün seçin. ' : ''}${!cat ? 'Kategori seçin.' : ''}</div>`); return; }
    const list = attrs.slice().sort((a, b) => Number(b.mandatory) - Number(a.mandatory));
    render($('[data-attrs]', el), html`<div class="stack">
      <div class="form-grid">${list.map((a) => html`<label class="field"><span>${a.name}${a.mandatory ? ' *' : ''} <span class="tiny muted">${a.id}${a.kind === 'variant' ? ' · varyant' : ''}</span></span>
        <div class="row" style="gap:6px"><input class="input" data-attr="${a.id}" value="${defaultFor(a)}" list="dl-${a.id}">${a.type && /enum|list|select/i.test(a.type) ? html`<button type="button" class="btn sm" data-act="vals" data-id="${a.id}">Değerler</button>` : ''}</div><datalist id="dl-${a.id}"></datalist></label>`)}</div>
      <div class="row wrap"><button class="btn" data-act="preview">Gönderilecek JSON'u göster</button><button class="btn primary" data-act="import">Hepsiburada'ya ürün gönder</button></div>
      <textarea class="input hide" data-json style="min-height:200px;font-family:ui-monospace,monospace;font-size:12px"></textarea>
    </div>`);
  }
  function buildProducts() {
    const box = $('[data-json]', el);
    if (box && !box.classList.contains('hide') && box.value.trim()) return JSON.parse(box.value);
    const attributes = {};
    $$('[data-attr]', el).forEach((i) => { if (i.value.trim()) attributes[i.dataset.attr] = i.value.trim(); });
    const miss = attrs.filter((a) => a.mandatory && !attributes[a.id]).map((a) => a.name);
    if (miss.length) throw new Error('Zorunlu özellikler boş: ' + miss.join(', '));
    return [{ categoryId: Number(cat.id) || cat.id, merchant: st.merchantId, attributes }];
  }
  actions(el, {
    vals: (t) => busy(t, async () => { const r = await api(`hbtest/values?category=${cat.id}&attribute=${encodeURIComponent(t.dataset.id)}`); render($(`#dl-${CSS.escape(t.dataset.id)}`, el), html`${r.values.map((v) => html`<option value="${v.value}">`)}`); toast(`${r.values.length} değer: kutuya yazmaya başlayın`); }),
    preview: () => { try { const box = $('[data-json]', el); box.value = pretty(buildProducts()); box.classList.remove('hide'); } catch (e) { toast(e.message, true); } },
    import: (t) => busy(t, async () => {
      const products = buildProducts();
      try { const r = await api('hbtest/import', { method: 'POST', body: { products } }); st.results = r.results; toast('Gönderildi · trackingId ' + r.trackingId); render($('[data-out1]', el), resultBox(r.response)); await load(); }
      catch (e) { render($('[data-out1]', el), html`<div class="notice bad small">${e.message}</div>`); throw e; }
    }),
    pstatus: (t) => busy(t, async () => { const r = await api('hbtest/product-status?trackingId=' + encodeURIComponent(st.results.trackingId), { fresh: true }); render($('[data-out1]', el), resultBox(r.status)); }),
    inv: (t) => busy(t, async () => { const r = await api('hbtest/inventory', { method: 'POST' }); toast(typeof r.count === 'number' ? `${r.count} ürün alındı` : String(r.count), typeof r.count !== 'number'); await load(); }),
    listing: (t) => busy(t, async () => {
      const s = selected(); if (!s) return toast('Envanterden bir ürün seçin', true);
      const r = await api('hbtest/listing', { method: 'POST', body: { ...s, stock: $('[data-lstock]', el).value, price: $('[data-lprice]', el).value.replace(',', '.') } });
      toast('Stok ve fiyat gönderildi'); st.results = r.results; await load();
    }),
    ustatus: (t) => busy(t, async () => { const r = await api(`hbtest/upload-status?kind=${t.dataset.k}&id=${encodeURIComponent(t.dataset.id)}`, { fresh: true }); render($('[data-out2]', el), resultBox(r.status)); }),
    otpl: () => { $('[data-obody]', el).value = orderTemplate(); },
    order: (t) => busy(t, async () => {
      let body; try { body = JSON.parse($('[data-obody]', el).value); } catch { return toast('Gövde geçerli JSON değil', true); }
      try { const r = await api('hbtest/order', { method: 'POST', body: { body } }); toast('Test siparişi oluşturuldu ' + (r.orderNumber || '')); render($('[data-out3]', el), resultBox(r.response)); st.results = r.results; }
      catch (e) { render($('[data-out3]', el), html`<div class="notice bad small">${e.message}</div>`); throw e; }
    }),
    osync: (t) => busy(t, async () => { const r = await api('hbtest/sync', { method: 'POST' }); toast(typeof r.orders === 'number' ? `${r.orders} sipariş kontrol edildi` : String(r.orders), typeof r.orders !== 'number'); await load(); }),
    copy: () => navigator.clipboard.writeText($('[data-sum]', el).value).then(() => toast('Özet kopyalandı'), () => toast('Kopyalanamadı', true)),
    cleanup: async (t) => {
      if (!(await confirmBox('Paneldeki tüm Hepsiburada siparişleri, paketleri ve ilanları silinsin mi? Canlı ortama geçmeden önce test verilerini temizlemek içindir; Hepsiburada tarafında hiçbir şey silinmez.', 'Temizle'))) return;
      busy(t, async () => { const r = await api('hbtest/cleanup', { method: 'POST' }); toast(`${r.orders} test siparişi temizlendi`); await load(); });
    },
  });
  await load();
  return { refresh: load };
}
