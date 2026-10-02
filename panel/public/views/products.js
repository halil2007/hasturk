// Ürünler & stok: merkezi stok (tüm kanallara gönderilir), hızlı stok girişi, ürün ekleme/düzenleme,
// kanal ilanlarının fiyat/komisyonu, kanallardan içe aktarma ve eşleşmeyen ilanları bağlama.
import { api, state, html, render, $, $$, money, money0, n, ago, dateTime, ch, chColor, chLogo, thumb, isMobile, actions, busy, toast, sheet, debounce, confirmBox, numIn } from '../core.js';
import { profit } from '../profit.js';

const FILTERS = [['', 'Tümü'], ['low', 'Kritik stok'], ['nocost', 'Alış fiyatı eksik'], ['passive', 'Pasif']];

export async function products(el, rest) {
  const f = { q: '', filter: rest[0] === 'kritik' ? 'low' : '', page: 1 };
  let rows = [], total = 0;
  render(el, html`<div class="stack">
    <div class="row wrap">
      <div class="search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün adı, SKU veya barkod" data-q></div>
      <button class="btn" data-act="import"><i class="ico ico-download"></i>Kanallardan içe aktar</button>
      <button class="btn" data-act="unlinked"><i class="ico ico-link"></i>Eşleştir <span data-unl></span></button>
      <button class="btn primary" data-act="new"><i class="ico ico-plus"></i>Ürün Ekle</button>
    </div>
    <div class="tabs" data-filters></div>
    <div class="card flush" data-box></div>
  </div>`);

  const stockCls = (p) => (p.stock <= 0 ? 'neg' : p.stock <= p.critical_stock ? 'low' : '');
  function dots(p) {
    return html`<div class="ch-dots">${(p.listings || []).map((l) => {
      const cls = l.error ? 'err' : l.pushed_stock != null && l.pushed_stock !== Math.max(0, p.stock) && state.settings && state.settings.stock_sync ? 'wait' : '';
      const t = l.error ? l.error : cls === 'wait' ? 'Stok gönderimi bekliyor' : `${ch(l.channel).name}: ${money(l.price)}`;
      return html`<span class="ch-dot ${cls}" title="${t}">${chLogo(l.channel, true)}${money0(l.price)}</span>`;
    })}${!(p.listings || []).length ? html`<span class="ch-dot wait">Kanalda yok</span>` : ''}</div>`;
  }
  const margin = (p) => (p.purchase_price && p.sale_price ? ((p.sale_price - p.purchase_price) / p.sale_price) * 100 : null);
  const stockCtl = (p) => html`<div class="stock-ctl"><button class="round" data-act="dec" data-id="${p.id}" aria-label="Stok azalt"><i class="ico ico-minus"></i></button>
    <span class="val num ${stockCls(p)}" data-act="stock" data-id="${p.id}" title="Stok girişi / sayım">${p.stock}</span>
    <button class="round" data-act="inc" data-id="${p.id}" aria-label="Stok artır"><i class="ico ico-plus"></i></button></div>`;
  function draw() {
    const mob = isMobile();
    const body = !rows.length ? html`<div class="empty">Ürün yok. “Kanallardan içe aktar” ile ürünleri çekebilir veya “Ürün Ekle” ile ekleyebilirsiniz.</div>`
      : mob ? html`<div class="m-list" style="padding:12px">${rows.map((p) => html`<div class="m-card" data-pid="${p.id}">
          <div class="top" data-act="edit" data-id="${p.id}" style="cursor:pointer">${thumb(p.image, p.name)}<div style="min-width:0;flex:1"><div class="ellipsis" style="font-weight:650">${p.name}</div><div class="muted tiny">${[p.sku, p.barcode].filter(Boolean).join(' · ')}</div></div></div>
          ${dots(p)}<div class="row"><span class="small muted">Satış <b style="color:var(--text)">${money(p.sale_price)}</b>${p.purchase_price ? html` · alış ${money(p.purchase_price)}` : ''}</span><span class="spacer"></span>${stockCtl(p)}</div></div>`)}</div>`
        : html`<div class="table-wrap"><table class="t"><thead><tr><th>Ürün</th><th>Kanallar (fiyat)</th><th class="r">Alış</th><th class="r">Satış</th><th class="r">Marj</th><th class="c">Ortak stok</th><th></th></tr></thead><tbody>
          ${rows.map((p) => { const m = margin(p); return html`<tr data-pid="${p.id}">
            <td><div class="row" style="cursor:pointer" data-act="edit" data-id="${p.id}">${thumb(p.image, p.name)}<div style="min-width:0"><div class="ellipsis" style="max-width:320px;font-weight:650">${p.name}${p.active ? '' : html` <span class="pill">Pasif</span>`}</div><div class="muted tiny">${[p.sku, p.barcode].filter(Boolean).join(' · ') || 'SKU yok'}</div></div></div></td>
            <td>${dots(p)}</td>
            <td class="r num">${p.purchase_price ? money(p.purchase_price) : html`<span style="color:var(--amber)">girilmedi</span>`}</td>
            <td class="r num" style="font-weight:650">${money(p.sale_price)}</td>
            <td class="r num ${m == null ? '' : m >= 0 ? 'up' : 'down'}">${m == null ? '—' : `%${n(m)}`}</td>
            <td class="c">${stockCtl(p)}</td>
            <td class="r"><button class="btn sm ghost" data-act="edit" data-id="${p.id}">Düzenle</button></td></tr>`; })}
        </tbody></table></div>`;
    render($('[data-box]', el), html`${body}${rows.length < total ? html`<div class="pager"><span class="muted small" style="margin-right:auto">${total} üründen ${rows.length} gösteriliyor</span><button class="btn sm" data-act="more">Daha fazla</button></div>` : html`<div class="pager"><span class="muted small">${total} ürün</span></div>`}`);
  }
  async function load(append = false) {
    const p = new URLSearchParams({ page: f.page, limit: 50 });
    if (f.q) p.set('q', f.q);
    if (f.filter) p.set('filter', f.filter);
    const r = await api('products?' + p);
    rows = append ? rows.concat(r.products) : r.products;
    total = r.total;
    render($('[data-filters]', el), html`${FILTERS.map(([k, t]) => html`<button class="tab ${f.filter === k ? 'on' : ''}" data-act="filter" data-k="${k}">${t}</button>`)}`);
    const unl = state.summary ? state.summary.unlinked : 0;
    $('[data-unl]', el).textContent = unl ? `(${unl})` : '';
    draw();
  }
  const refresh = () => { f.page = 1; return load().catch((e) => toast(e.message, true)); };
  const bump = quickStock(() => rows, el);
  actions(el, {
    filter: (t) => { f.filter = t.dataset.k; refresh(); },
    more: () => { f.page++; load(true); },
    inc: (t) => bump(t.dataset.id, 1),
    dec: (t) => bump(t.dataset.id, -1),
    stock: (t) => stockDialog(rows.find((x) => x.id === Number(t.dataset.id)), refresh),
    edit: (t) => productForm(Number(t.dataset.id), refresh),
    new: () => productForm(0, refresh),
    import: () => importDialog(refresh),
    unlinked: () => unlinkedDialog(refresh),
  });
  $('[data-q]', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); refresh(); }, 300));
  await refresh();
  if (rest[0] === 'ice-aktar') importDialog(refresh);
  if (rest[0] === 'eslestir') unlinkedDialog(refresh);
  if (rest[0] === 'yeni') productForm(0, refresh);
  return { refresh };
}

// Hızlı +/−: art arda basışlar toplanıp tek istekte gönderilir (Ürünler ve Stoklar sayfası)
export function quickStock(getRows, el) {
  const pending = new Map();
  const flush = debounce(async () => {
    const list = [...pending]; pending.clear();
    for (const [id, d] of list) { try { await api(`products/${id}/stock`, { method: 'POST', body: { mode: 'add', qty: d, note: 'Hızlı düzeltme' } }); } catch (e) { toast(e.message, true); } }
    toast('Stok güncellendi, kanallara gönderiliyor');
  }, 700);
  return (id, d) => {
    const p = getRows().find((x) => x.id === Number(id));
    if (!p) return;
    p.stock += d;
    pending.set(p.id, (pending.get(p.id) || 0) + d);
    $$(`[data-pid="${p.id}"] .val`, el).forEach((v) => { v.textContent = p.stock; v.className = `val num ${p.stock <= 0 ? 'neg' : p.stock <= p.critical_stock ? 'low' : ''}`; });
    flush();
  };
}

// ---------- stok girişi / sayım ----------
export function stockDialog(p, done) {
  if (!p) return;
  let mode = 'add';
  const s = sheet({
    title: p.name, size: 'narrow',
    body: html`<div class="stack">
      <div class="row"><span class="muted">Mevcut stok</span><span class="spacer"></span><b class="num" style="font-size:22px">${p.stock}</b></div>
      <div class="seg" style="width:100%"><button class="on" data-m="add" style="flex:1">Giriş (+)</button><button data-m="sub" style="flex:1">Çıkış (−)</button><button data-m="set" style="flex:1">Sayım (=)</button></div>
      <label class="field"><span data-lbl>Gelen adet</span><input class="input big" type="number" inputmode="numeric" data-qty autofocus></label>
      <label class="field"><span>Not (isteğe bağlı)</span><input class="input" data-note placeholder="ör. tedarikçi faturası"></label>
      <div class="muted small" data-after></div>
      <p class="muted small" style="margin:0">Yeni stok kaydedildiği anda tüm kanallara gönderilir.</p>
    </div>`,
    foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>Kaydet</button>`,
  });
  const qty = $('[data-qty]', s.el);
  const after = () => { const v = Math.round(numIn(qty.value)); const r = mode === 'set' ? v : mode === 'add' ? p.stock + v : p.stock - v; $('[data-after]', s.el).textContent = qty.value ? `Yeni stok: ${r}` : ''; return r; };
  qty.oninput = after;
  $('.seg', s.el).onclick = (e) => {
    const b = e.target.closest('[data-m]'); if (!b) return;
    mode = b.dataset.m;
    $$('.seg button', s.el).forEach((x) => x.classList.toggle('on', x === b));
    $('[data-lbl]', s.el).textContent = { add: 'Gelen adet', sub: 'Çıkan adet', set: 'Sayılan (gerçek) adet' }[mode];
    after(); qty.focus();
  };
  setTimeout(() => qty.focus(), 50);
  $('[data-save]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
    if (qty.value === '') return toast('Adet girin', true);
    const v = Math.round(numIn(qty.value));
    await api(`products/${p.id}/stock`, { method: 'POST', body: mode === 'set' ? { mode: 'set', qty: v, note: $('[data-note]', s.el).value } : { mode: 'add', qty: mode === 'sub' ? -v : v, note: $('[data-note]', s.el).value } });
    toast('Stok kaydedildi'); s.close(); done();
  });
}

// ---------- ürün formu ----------
export async function productForm(id, done) {
  const s = sheet({ title: id ? 'Ürünü düzenle' : 'Yeni ürün', size: 'wide' });
  s.setBody(html`<div class="empty"><i class="ico ico-sync spin"></i></div>`);
  const p = id ? await api('products/' + id) : { name: '', sku: '', barcode: '', purchase_price: 0, sale_price: 0, vat: 20, desi: 1, stock: 0, critical_stock: 0, active: 1, listings: [], moves: [], sales: [] };
  const st = state.settings || {};
  const ikasChannels = state.channels.filter((c) => c.enabled && c.caps.createProduct);
  const lp = (l) => {
    const rate = l.commission ?? (st.commission || {})[l.channel] ?? 0;
    return profit({ sale: l.price, purchase: numIn($('[name=purchase_price]', s.body)?.value ?? p.purchase_price), commissionRate: rate, shipping: (st.shipping || {})[l.channel] || 0, fee: (st.service_fee || {})[l.channel] || 0 });
  };
  s.setBody(html`<form class="stack" data-form>
    <div class="card stack">
      <h3>Ürün bilgileri</h3>
      <label class="field"><span>Ürün adı *</span><input class="input" name="name" required value="${p.name}"></label>
      <div class="form-grid">
        <label class="field"><span>Stok kodu (SKU)</span><input class="input" name="sku" value="${p.sku || ''}" placeholder="kanallarla aynı olmalı"></label>
        <label class="field"><span>Barkod</span><input class="input" name="barcode" value="${p.barcode || ''}"></label>
        <label class="field"><span>Marka</span><input class="input" name="brand" value="${p.brand || ''}"></label>
        <label class="field"><span>Kategori</span><input class="input" name="category" value="${p.category || ''}"></label>
      </div>
      <label class="field"><span>Görsel adresi</span><input class="input" name="image" value="${p.image || ''}" placeholder="https://…"></label>
      <label class="field"><span>Açıklama</span><textarea class="input" name="description">${p.description || ''}</textarea></label>
    </div>
    <div class="card stack">
      <h3>Fiyat, maliyet ve stok</h3>
      <div class="form-grid">
        <label class="field"><span>Alış fiyatı (KDV dahil)</span><div class="input-group"><input class="input" name="purchase_price" inputmode="decimal" value="${p.purchase_price || ''}"><span class="suffix">₺</span></div></label>
        <label class="field"><span>Satış fiyatı</span><div class="input-group"><input class="input" name="sale_price" inputmode="decimal" value="${p.sale_price || ''}"><span class="suffix">₺</span></div></label>
        <label class="field"><span>KDV oranı</span><select class="input" name="vat">${[0, 1, 10, 20].map((v) => html`<option value="${v}" ${Number(p.vat) === v ? 'selected' : ''}>%${v}</option>`)}</select></label>
        <label class="field"><span>Desi</span><input class="input" name="desi" inputmode="decimal" value="${p.desi || ''}"></label>
        <label class="field"><span>Stok</span><input class="input" name="stock" type="number" inputmode="numeric" value="${p.stock}"></label>
        <label class="field"><span>Kritik stok uyarısı</span><input class="input" name="critical_stock" type="number" inputmode="numeric" value="${p.critical_stock || 0}"></label>
      </div>
      <label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Aktif (pasif ürünün stoğu kanallara gönderilmez)</label>
    </div>
    ${p.listings.length ? html`<div class="card flush"><div style="padding:16px 16px 0"><h3>Kanal ilanları</h3><p class="muted small" style="margin:4px 0 8px">Fiyat değişikliği kaydedilince ilgili kanala gönderilir. Komisyon boşsa kanal varsayılanı kullanılır.</p></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Kanal</th><th class="r">Fiyat</th><th class="r">Komisyon %</th><th class="r">Ürün başı kâr</th><th class="r">Kanaldaki stok</th></tr></thead><tbody>
        ${p.listings.map((l) => { const r = lp(l); return html`<tr data-l="${l.channel}" data-rid="${l.remote_id}">
          <td><span class="ch-name">${chLogo(l.channel, true)}${ch(l.channel).name}</span><div class="muted tiny ellipsis" style="max-width:180px">${l.remote_id}</div>${l.error ? html`<div class="tiny" style="color:var(--bad)">${l.error}</div>` : ''}</td>
          <td class="r"><input class="input qty-in" style="width:96px" inputmode="decimal" data-lf="price" value="${l.price ?? ''}"></td>
          <td class="r"><input class="input qty-in" inputmode="decimal" data-lf="commission" value="${l.commission ?? ''}" placeholder="${(st.commission || {})[l.channel] ?? 0}"></td>
          <td class="r num" data-lprofit style="font-weight:650;color:${r.unitProfit >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(r.unitProfit)}</td>
          <td class="r num">${l.remote_stock ?? '—'}${l.price_dirty ? html`<div class="tiny" style="color:var(--warn)">fiyat gönderilecek</div>` : ''}</td></tr>`; })}
      </tbody></table></div></div>` : ''}
    ${!id && ikasChannels.length ? html`<div class="card stack"><h3>Kanallarda oluştur</h3>
      ${ikasChannels.map((c) => html`<label class="check"><input type="checkbox" name="create_on" value="${c.id}"> ${c.name} (ikas) mağazasında da oluştur</label>`)}
      <p class="muted small" style="margin:0">Trendyol, Hepsiburada ve PttAVM'de ürün açmak kategori özellikleri gerektirdiği için kanalın kendi panelinden yapılır; aynı SKU veya barkodla açıldığında senkronla otomatik bağlanır.</p></div>` : ''}
    ${id ? html`<div class="two-col">
      <div class="card"><h3 style="margin-bottom:8px">Stok hareketleri</h3>${p.moves.length ? html`<table class="t"><tbody>${p.moves.map((m) => html`<tr><td class="small">${dateTime(m.created_at)}<div class="muted tiny">${m.reason}${m.ref ? ` · ${m.ref}` : ''}</div></td><td class="r num" style="font-weight:650;color:${m.delta > 0 ? 'var(--good)' : 'var(--bad)'}">${m.delta > 0 ? '+' : ''}${m.delta}</td><td class="r num muted">${m.stock_after ?? ''}</td></tr>`)}</tbody></table>` : html`<div class="muted small">Henüz hareket yok</div>`}</div>
      <div class="card"><h3 style="margin-bottom:8px">Son 30 gün satış</h3>${p.sales.length ? html`<table class="t"><tbody>${p.sales.map((x) => html`<tr><td>${ch(x.channel).name}</td><td class="r num">${x.qty} adet</td><td class="r num">${money(x.revenue)}</td></tr>`)}</tbody></table>` : html`<div class="muted small">Satış yok</div>`}</div>
    </div>` : ''}
  </form>`);
  s.setFoot(html`${id ? html`<button class="btn danger ghost" data-del>Sil</button>` : ''}<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>Kaydet</button>`);
  const form = $('[data-form]', s.body);
  form.addEventListener('input', () => {
    $$('tr[data-l]', form).forEach((tr) => {
      const l = { channel: tr.dataset.l, price: numIn($('[data-lf=price]', tr).value), commission: $('[data-lf=commission]', tr).value === '' ? null : numIn($('[data-lf=commission]', tr).value) };
      const r = lp(l), c = $('[data-lprofit]', tr);
      c.textContent = money(r.unitProfit); c.style.color = r.unitProfit >= 0 ? 'var(--good)' : 'var(--bad)';
    });
  });
  form.onsubmit = (e) => e.preventDefault();
  $('[data-save]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
    const fd = new FormData(form), b = {};
    for (const k of ['name', 'sku', 'barcode', 'brand', 'category', 'image', 'description', 'purchase_price', 'sale_price', 'vat', 'desi', 'critical_stock']) b[k] = fd.get(k);
    for (const k of ['purchase_price', 'sale_price', 'desi']) b[k] = numIn(b[k]);
    b.active = fd.get('active') ? 1 : 0;
    if (!b.name.trim()) return toast('Ürün adı gerekli', true);
    if (!id || Number(fd.get('stock')) !== p.stock) b.stock = Number(fd.get('stock')) || 0;
    b.listings = $$('tr[data-l]', form).map((tr) => ({ channel: tr.dataset.l, remote_id: tr.dataset.rid, price: numIn($('[data-lf=price]', tr).value), commission: $('[data-lf=commission]', tr).value }));
    b.create_on = fd.getAll('create_on');
    const r = await api(id ? 'products/' + id : 'products', { method: id ? 'PUT' : 'POST', body: b });
    if (r.errors && r.errors.length) toast(r.errors.join(' · '), true); else toast(r.created && r.created.length ? `Kaydedildi ve ${r.created.length} mağazada oluşturuldu` : 'Kaydedildi');
    s.close(); done();
  });
  const del = $('[data-del]', s.el);
  if (del) del.onclick = async () => {
    if (!(await confirmBox('Ürün panelden silinsin mi? Kanallardaki ilanlar silinmez, sadece bağlantı kalkar.', 'Sil'))) return;
    await api('products/' + id, { method: 'DELETE' }); toast('Silindi'); s.close(); done();
  };
}

// ---------- kanallardan içe aktar ----------
export function importDialog(done) {
  const chs = state.channels.filter((c) => c.enabled);
  const s = sheet({
    title: 'Kanallardan ürünleri içe aktar', size: 'narrow',
    body: html`<div class="stack">
      <p style="margin:0">Seçilen kanallardaki ilanlar çekilir. Aynı <b>SKU</b> (stok kodu) veya <b>barkod</b>a sahip ilanlar tek ürün altında birleşir.</p>
      ${chs.map((c) => html`<label class="check"><input type="checkbox" value="${c.id}" checked> ${chLogo(c.id, true)}${c.name}${c.listings ? html` <span class="muted small">(${c.listings} ilan)</span>` : ''}</label>`)}
      <label class="check"><input type="checkbox" data-create checked> Panelde olmayan ürünleri oluştur (stok: ilk kanaldaki stok)</label>
      <div class="notice small">İçe aktarma stokları değiştirmez. Eşleştirmeleri kontrol ettikten sonra Ayarlar'dan <b>stok senkronunu</b> açtığınızda panel stoğu tüm kanallara gönderilir.</div>
      <div data-res></div>
    </div>`,
    foot: html`<span class="spacer"></span><button class="btn" data-close>Kapat</button><button class="btn primary" data-go>İçe aktar</button>`,
  });
  $('[data-go]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
    const channels = $$('input[value]', s.body).filter((x) => x.checked).map((x) => x.value);
    const r = await api('import', { method: 'POST', body: { channels, createMissing: $('[data-create]', s.body).checked } });
    render($('[data-res]', s.body), html`<div class="notice good"><div>${Object.entries(r.channels).map(([k, v]) => html`<div>${ch(k).name}: ${typeof v === 'number' ? `${v} ilan` : v}</div>`)}<div style="margin-top:6px"><b>${r.created}</b> yeni ürün, <b>${r.linked}</b> ilan eşleşti.</div></div></div>`);
    done();
  });
}

// ---------- eşleşmeyen ilanlar ----------
export function unlinkedDialog(done) {
  const s = sheet({ title: 'Eşleşmeyen ilanlar', size: 'wide' });
  async function load() {
    const r = await api('listings?unlinked=1');
    s.setBody(r.listings.length ? html`<div class="stack"><p class="muted small" style="margin:0">Bu ilanların stoğu senkronlanmaz ve siparişleri stoktan düşmez. Bir ürüne bağlayın veya yeni ürün olarak ekleyin.</p>
      <div class="list">${r.listings.map((l) => html`<div class="card" data-k="${l.channel}|${l.remote_id}">
        <div class="row wrap"><span class="ch-name">${chLogo(l.channel, true)}${ch(l.channel).name}</span><b class="ellipsis" style="flex:1;min-width:160px">${l.name}</b><span class="muted small">${[l.sku, l.barcode].filter(Boolean).join(' · ')}</span></div>
        <div class="row wrap" style="margin-top:8px"><div class="search" style="min-width:200px"><i class="ico ico-search"></i><input class="input" placeholder="Bağlanacak ürünü ara" data-find></div>
          <button class="btn sm" data-act="create">Yeni ürün olarak ekle</button></div>
        <div class="list" data-results style="margin-top:6px"></div>
      </div>`)}</div></div>` : html`<div class="empty">Tüm ilanlar eşleşmiş 🎉</div>`);
  }
  const link = async (card, body) => {
    const [channel, remote_id] = card.dataset.k.split('|');
    await api('listings/link', { method: 'POST', body: { channel, remote_id, ...body } });
    toast('Bağlandı'); card.remove(); done();
  };
  s.body.addEventListener('input', debounce(async (e) => {
    if (!e.target.matches('[data-find]')) return;
    const card = e.target.closest('[data-k]'), q = e.target.value.trim();
    if (q.length < 2) return render($('[data-results]', card), '');
    const r = await api('products?limit=6&filter=all&q=' + encodeURIComponent(q));
    render($('[data-results]', card), html`${r.products.map((p) => html`<button class="btn sm block" style="justify-content:flex-start" data-pick="${p.id}">${p.name} <span class="muted">${p.sku || ''}</span></button>`)}`);
  }, 250));
  s.body.addEventListener('click', (e) => {
    const card = e.target.closest('[data-k]');
    if (!card) return;
    const pick = e.target.closest('[data-pick]');
    if (pick) busy(pick, () => link(card, { product_id: Number(pick.dataset.pick) }));
    if (e.target.closest('[data-act=create]')) busy(e.target.closest('button'), () => link(card, { create: true }));
  });
  load().catch((e) => toast(e.message, true));
}
