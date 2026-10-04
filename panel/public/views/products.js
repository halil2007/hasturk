// Ürünler: varyantlar ana ürün altında gruplanır; merkezi stok (her kanala kendi kuralıyla gönderilir), hızlı stok girişi,
// ürün ekleme/düzenleme, kanal ilanlarının fiyat/komisyonu ve kanallardan içe aktarma. Eşleştirme ayrı sayfadadır.
import { api, state, html, raw, render, $, $$, money, money0, n, ago, dateTime, ch, chColor, chLogo, thumb, isMobile, actions, busy, toast, sheet, debounce, confirmBox, numIn , activeChannels } from '../core.js';
import { profit } from '../profit.js';
import { ruleDialog, ruleText } from './stocks.js';
import { setQuery } from '../app.js';

// Stok senkronu kapalıyken ana katalog (ikas) sitesindeki ilanı olan ürünün stoğu siteden okunur; panelde değiştirilmez
export const siteStock = (p) => !(state.settings && state.settings.stock_sync)
  && (p.listings || []).some((l) => ((state.settings && state.settings.catalog_channels) || ['ikas1']).includes(l.channel) && l.remote_stock != null);
export const siteStockVal = (p, cls = '') => html`<span class="val num ${cls}" style="cursor:help" title="ikas sitesinden okunur (stok senkronu kapalı). Adedi ikas panelinden değiştirin.">${p.stock}<span class="tiny muted" style="margin-left:4px;font-weight:500">ikas</span></span>`;

const FILTERS = [['', 'Tümü'], ['low', 'Kritik stok'], ['nocost', 'Alış fiyatı eksik'], ['nolisting', 'Kanalda olmayan'], ['passive', 'Pasif']];

export async function products(el, rest, query = {}) {
  const f = { q: query.q || '', filter: query.f || (rest[0] === 'kritik' ? 'low' : ''), page: 1 };
  let rows = [], total = 0, groupsTotal = 0;
  render(el, html`<div class="stack">
    <div class="row wrap">
      <div class="search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün adı, SKU veya barkod" data-q value="${f.q}"></div>
      <span class="spacer"></span>
      <button class="btn" data-act="import"><i class="ico ico-download"></i>Kanallardan içe aktar</button>
      <a class="btn" href="#/eslestirme"><i class="ico ico-link"></i>Eşleştirme <span data-unl></span></a>
      <button class="btn primary" data-act="new"><i class="ico ico-plus"></i>Ürün Ekle</button>
    </div>
    <div class="tabs" data-filters></div>
    <div class="card flush" data-box></div>
  </div>`);

  const stockCls = (p) => (p.stock <= 0 ? 'neg' : p.stock <= (p.low_limit ?? p.critical_stock) ? 'low' : '');
  function dots(p) {
    return html`<div class="ch-dots">${(p.listings || []).map((l) => {
      const cls = l.error ? 'err' : l.pushed_stock != null && l.pushed_stock !== (l.desired ?? Math.max(0, p.stock)) && state.settings && state.settings.stock_sync ? 'wait' : '';
      const t = l.error ? l.error : cls === 'wait' ? 'Stok gönderimi bekliyor' : `${ch(l.channel).name}: ${money(l.price)} · stok ${l.desired ?? p.stock}${ruleText(l) ? ` (${ruleText(l)})` : ''}`;
      return html`<span class="ch-dot ${cls}" title="${t}">${chLogo(l.channel, true)}${money0(l.price)}</span>`;
    })}${!(p.listings || []).length ? html`<span class="ch-dot wait">Kanalda yok</span>` : ''}</div>`;
  }
  const margin = (p) => (p.purchase_price && p.sale_price ? ((p.sale_price - p.purchase_price) / p.sale_price) * 100 : null);
  const stockCtl = (p) => siteStock(p) ? siteStockVal(p, stockCls(p)) : html`<div class="stock-ctl"><button class="round" data-act="dec" data-id="${p.id}" aria-label="Stok azalt"><i class="ico ico-minus"></i></button>
    <span class="val num ${stockCls(p)}" data-act="stock" data-id="${p.id}" title="Stok girişi / sayım">${p.stock}</span>
    <button class="round" data-act="inc" data-id="${p.id}" aria-label="Stok artır"><i class="ico ico-plus"></i></button></div>`;
  const title = (p) => html`${p.variant_name && p.group_name ? p.group_name : p.name}${p.variant_name ? html`<span class="var-tag">${p.variant_name}</span>` : ''}`;
  const brand = (b) => (b ? html`<span class="brand-tag" title="Marka">${b}</span>` : '');
  // Varyantlar ana ürün altında toplanır; ana ürün satırına tıklayınca varyantlar açılır / kapanır
  const opened = new Set();
  const groupList = () => { const m = new Map(); for (const p of rows) { const k = p.gk || p.group_name || p.name; if (!m.has(k)) m.set(k, []); m.get(k).push(p); } return [...m]; };
  const isGroup = (list) => list.length > 1;
  const range = (vals) => { const v = vals.filter((x) => x > 0); if (!v.length) return '—'; const lo = Math.min(...v), hi = Math.max(...v); return lo === hi ? money(lo) : `${money0(lo)} – ${money0(hi)}`; };
  const chSummary = (list) => { const c = new Map(); list.forEach((p) => (p.listings || []).forEach((l) => c.set(l.channel, (c.get(l.channel) || 0) + 1))); return c.size ? html`<div class="ch-dots">${[...c].map(([id, k]) => html`<span class="ch-dot" title="${ch(id).name}: ${k} / ${list.length} varyant">${chLogo(id, true)}${k}/${list.length}</span>`)}</div>` : html`<span class="ch-dot wait">Kanalda yok</span>`; };
  const gStock = (list) => list.reduce((a, p) => a + Math.max(0, p.stock), 0);
  function draw() {
    const mob = isMobile(), gl = groupList(), all = !!f.q;
    const varRow = (p) => { const m = margin(p); return html`<tr class="var-row" data-pid="${p.id}">
      <td><div class="row" style="cursor:pointer" data-act="edit" data-id="${p.id}">${thumb(p.image, p.name, 'sm')}<div style="min-width:0"><div class="ellipsis" style="max-width:320px;font-weight:600">${p.variant_name ? html`<span class="var-tag" style="margin-left:0">${p.variant_name}</span>` : p.name}${p.active ? '' : html` <span class="pill">Pasif</span>`}</div><div class="muted tiny">${[p.sku, p.barcode].filter(Boolean).join(' · ') || 'SKU yok'}</div></div></div></td>
      <td>${dots(p)}</td>
      <td class="r num">${p.purchase_price ? money(p.purchase_price) : html`<span style="color:var(--amber)">girilmedi</span>`}</td>
      <td class="r num" style="font-weight:650">${money(p.sale_price)}</td>
      <td class="r num ${m == null ? '' : m >= 0 ? 'up' : 'down'}">${m == null ? '—' : `%${n(m)}`}</td>
      <td class="c">${stockCtl(p)}</td>
      <td class="r"><button class="btn sm ghost" data-act="edit" data-id="${p.id}">Düzenle</button></td></tr>`; };
    const single = (p) => { const m = margin(p); return html`<tr data-pid="${p.id}">
      <td><div class="row" style="cursor:pointer" data-act="edit" data-id="${p.id}">${thumb(p.image, p.name)}<div style="min-width:0"><div class="ellipsis" style="max-width:340px;font-weight:650">${p.name}${p.active ? '' : html` <span class="pill">Pasif</span>`}</div><div class="muted tiny">${brand(p.brand)}${[p.sku, p.barcode].filter(Boolean).join(' · ') || 'SKU yok'}</div></div></div></td>
      <td>${dots(p)}</td>
      <td class="r num">${p.purchase_price ? money(p.purchase_price) : html`<span style="color:var(--amber)">girilmedi</span>`}</td>
      <td class="r num" style="font-weight:650">${money(p.sale_price)}</td>
      <td class="r num ${m == null ? '' : m >= 0 ? 'up' : 'down'}">${m == null ? '—' : `%${n(m)}`}</td>
      <td class="c">${stockCtl(p)}</td>
      <td class="r"><button class="btn sm ghost" data-act="edit" data-id="${p.id}">Düzenle</button></td></tr>`; };
    const head = ([k, list], i) => { const p0 = list[0], on = all || opened.has(k), low = list.some((p) => stockCls(p)), gname = p0.group_name || p0.name;
      return html`<tr class="grp-head ${on ? 'on' : ''}" data-act="tog" data-gi="${i}">
        <td><div class="row"><i class="ico ico-down grp-chev"></i>${thumb(list.find((p) => p.image)?.image || '', gname)}<div style="min-width:0"><div class="ellipsis" style="max-width:320px;font-weight:700">${gname}</div><div class="muted tiny">${brand(list.find((p) => p.brand)?.brand)}<b style="color:var(--text)">${list.length} varyant</b>${list.length <= 4 ? ` · ${list.map((p) => p.variant_name || p.sku || '').filter(Boolean).join(', ')}` : ''}</div></div></div></td>
        <td>${chSummary(list)}</td>
        <td class="r num muted">${range(list.map((p) => p.purchase_price))}</td>
        <td class="r num" style="font-weight:650">${range(list.map((p) => p.sale_price))}</td>
        <td class="r num muted">—</td>
        <td class="c"><span class="num ${low ? 'low' : ''}" style="font-weight:700" title="Varyantların toplam stoğu">${gStock(list)}</span></td>
        <td class="r"><button class="btn sm ghost" data-act="tog" data-gi="${i}">${on ? 'Kapat' : 'Varyantlar'}</button></td></tr>
        ${on ? list.map(varRow) : ''}`; };
    const mCard = ([k, list], i) => { if (!isGroup(list)) { const p = list[0]; return html`<div class="m-card" data-pid="${p.id}">
          <div class="top" data-act="edit" data-id="${p.id}" style="cursor:pointer">${thumb(p.image, p.name)}<div style="min-width:0;flex:1"><div class="ellipsis" style="font-weight:650">${p.name}</div><div class="muted tiny">${brand(p.brand)}${[p.sku, p.barcode].filter(Boolean).join(' · ')}</div></div></div>
          ${dots(p)}<div class="row"><span class="small muted">Satış <b style="color:var(--text)">${money(p.sale_price)}</b>${p.purchase_price ? html` · alış ${money(p.purchase_price)}` : ''}</span><span class="spacer"></span>${stockCtl(p)}</div></div>`; }
      const on = all || opened.has(k), gname = list[0].group_name || list[0].name;
      return html`<div class="m-card grp ${on ? 'on' : ''}">
        <div class="top" data-act="tog" data-gi="${i}" style="cursor:pointer">${thumb(list.find((p) => p.image)?.image || '', gname)}<div style="min-width:0;flex:1"><div class="ellipsis" style="font-weight:700">${gname}</div><div class="muted tiny">${brand(list.find((p) => p.brand)?.brand)}${list.length} varyant · ${range(list.map((p) => p.sale_price))} · stok ${gStock(list)}</div></div><i class="ico ico-down grp-chev"></i></div>
        ${on ? html`<div class="m-vars">${list.map((p) => html`<div class="m-var" data-pid="${p.id}"><div style="min-width:0;flex:1" data-act="edit" data-id="${p.id}"><span class="var-tag" style="margin-left:0">${p.variant_name || p.name}</span><div class="muted tiny">${p.sku || ''} · ${money(p.sale_price)}</div></div>${stockCtl(p)}</div>`)}</div>` : ''}</div>`; };
    const body = !rows.length ? html`<div class="empty">Ürün yok. “Kanallardan içe aktar” ile ürünleri çekebilir veya “Ürün Ekle” ile ekleyebilirsiniz.</div>`
      : mob ? html`<div class="m-list" style="padding:12px">${gl.map(mCard)}</div>`
        : html`<div class="table-wrap"><table class="t prod-t"><thead><tr><th>Ürün</th><th>Kanallar (fiyat)</th><th class="r">Alış</th><th class="r">Satış</th><th class="r">Marj</th><th class="c">Ortak stok</th><th></th></tr></thead><tbody>
          ${gl.map((g, i) => (isGroup(g[1]) ? head(g, i) : single(g[1][0])))}
        </tbody></table></div>`;
    const shown = gl.length;
    render($('[data-box]', el), html`${body}<div class="pager"><span class="muted small" style="margin-right:auto">${n(groupsTotal)} ana ürün · ${n(total)} ürün/varyant${shown < groupsTotal ? ` · ${shown} gösteriliyor` : ''}</span>${gl.some((g) => isGroup(g[1])) && !all ? html`<button class="btn sm ghost" data-act="togall">${opened.size ? 'Tümünü kapat' : 'Tümünü aç'}</button>` : ''}${shown < groupsTotal ? html`<button class="btn sm" data-act="more">Daha fazla</button>` : ''}</div>`);
  }
  async function load(append = false) {
    setQuery({ f: f.filter, q: f.q });
    const p = new URLSearchParams({ page: f.page, limit: 40, group: 1 });
    if (f.q) p.set('q', f.q);
    if (f.filter) p.set('filter', f.filter);
    const r = await api('products?' + p);
    rows = append ? rows.concat(r.products) : r.products;
    total = r.total; groupsTotal = r.groups ?? r.total;
    render($('[data-filters]', el), html`${FILTERS.map(([k, t]) => html`<button class="tab ${f.filter === k ? 'on' : ''}" data-act="filter" data-k="${k}">${t}</button>`)}`);
    const unl = state.summary ? state.summary.unmatched : 0;
    $('[data-unl]', el).textContent = unl ? `(${unl})` : '';
    draw();
  }
  const refresh = () => { f.page = 1; return load().catch((e) => toast(e.message, true)); };
  const bump = quickStock(() => rows, el);
  actions(el, {
    filter: (t) => { f.filter = t.dataset.k; refresh(); },
    tog: (t) => { const g = groupList()[Number(t.dataset.gi)]; if (!g) return; if (opened.has(g[0])) opened.delete(g[0]); else opened.add(g[0]); draw(); },
    togall: () => { if (opened.size) opened.clear(); else groupList().forEach(([k]) => opened.add(k)); draw(); },
    more: () => { f.page++; load(true); },
    inc: (t) => bump(t.dataset.id, 1),
    dec: (t) => bump(t.dataset.id, -1),
    stock: (t) => stockDialog(rows.find((x) => x.id === Number(t.dataset.id)), refresh),
    edit: (t) => productForm(Number(t.dataset.id), refresh),
    new: () => productForm(0, refresh),
    import: () => importDialog(refresh),
  });
  $('[data-q]', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); refresh(); }, 300));
  await refresh();
  if (rest[0] === 'ice-aktar') importDialog(refresh);
  if (rest[0] === 'eslestir') location.hash = '#/eslestirme';
  if (rest[0] === 'yeni') productForm(0, refresh);
  else if (/^\d+$/.test(rest[0] || '')) productForm(Number(rest[0]), refresh);
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

// Kanaldan gelen HTML açıklama: yalnızca biçim etiketleri kalır (betik, stil, olay öznitelikleri ve javascript: bağlantıları silinir)
function safeHtml(src) {
  const doc = new DOMParser().parseFromString(String(src || ''), 'text/html');
  doc.querySelectorAll('script,style,iframe,object,embed,form,input,button,link,meta,base,svg').forEach((e) => e.remove());
  doc.querySelectorAll('*').forEach((e) => [...e.attributes].forEach((a) => {
    if (/^on/i.test(a.name) || a.name === 'style' || a.name === 'class' || a.name === 'id' || (/^(href|src|srcset|action|formaction|xlink:href)$/i.test(a.name) && !/^\s*(https?:|\/)/i.test(a.value))) e.removeAttribute(a.name);
  }));
  doc.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
  return doc.body.innerHTML;
}
// Açıklamanın geldiği kanal (bağlı ilanlardan aynı metni taşıyan)
const descSource = (p) => { const l = (p.listings || []).find((x) => x.description && x.description === p.description); return l ? ch(l.channel).name : ''; };

// ---------- ürün formu ----------
export async function productForm(id, done) {
  const s = sheet({ title: id ? 'Ürünü düzenle' : 'Yeni ürün', size: 'wide' });
  s.setBody(html`<div class="empty"><i class="ico ico-sync spin"></i></div>`);
  const p = id ? await api('products/' + id) : { name: '', sku: '', barcode: '', purchase_price: 0, sale_price: 0, vat: 20, desi: 1, stock: 0, critical_stock: 0, active: 1, listings: [], moves: [], sales: [] };
  const st = state.settings || {};
  const ikasChannels = activeChannels().filter((c) => c.enabled && c.caps.createProduct);
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
        <label class="field"><span>Kategori</span><input class="input" name="category" value="${p.category || ''}" placeholder="ikas'tan gelir"><small>Pazaryerine yüklemede kategori eşleştirmesi buna göre yapılır</small></label>
        <label class="field"><span>Ana ürün (varyant grubu)</span><input class="input" name="group_name" value="${p.group_name || ''}" placeholder="varyantlar bu adla gruplanır"></label>
        <label class="field"><span>Varyant</span><input class="input" name="variant_name" value="${p.variant_name || ''}" placeholder="ör. 5 kg / Kırmızı"></label>
      </div>
      <label class="field"><span>Görsel adresi</span><input class="input" name="image" value="${p.image || ''}" placeholder="https://…"></label>
      ${p.description && /<[a-z][\s\S]*>/i.test(p.description) ? html`<div class="field"><span>Açıklama${descSource(p) ? html` <span class="muted tiny">· kaynak: ${descSource(p)}</span>` : ''}</span><div class="desc-view">${raw(safeHtml(p.description))}</div>
        <details style="margin-top:6px"><summary class="small muted" style="cursor:pointer">Açıklamayı düzenle (HTML)</summary><textarea class="input" name="description" style="min-height:160px;margin-top:6px">${p.description}</textarea></details></div>`
        : html`<label class="field"><span>Açıklama${descSource(p) ? html` <span class="muted tiny">· kaynak: ${descSource(p)}</span>` : ''}</span><textarea class="input" name="description" style="min-height:110px">${p.description || ''}</textarea></label>`}
    </div>
    <div class="card stack">
      <h3>Fiyat, maliyet ve stok</h3>
      <div class="form-grid">
        <label class="field"><span>Alış fiyatı (KDV dahil)</span><div class="input-group"><input class="input" name="purchase_price" inputmode="decimal" value="${p.purchase_price || ''}"><span class="suffix">₺</span></div></label>
        <label class="field"><span>Satış fiyatı</span><div class="input-group"><input class="input" name="sale_price" inputmode="decimal" value="${p.sale_price || ''}"><span class="suffix">₺</span></div></label>
        <label class="field"><span>KDV oranı</span><select class="input" name="vat">${[0, 1, 10, 20].map((v) => html`<option value="${v}" ${Number(p.vat) === v ? 'selected' : ''}>%${v}</option>`)}</select></label>
        <label class="field"><span>Desi</span><input class="input" name="desi" inputmode="decimal" value="${p.desi || ''}"></label>
        ${siteStock(p) ? html`<label class="field"><span>Stok</span><input class="input" type="number" value="${p.stock}" readonly><small>ikas sitesinden okunur (stok senkronu kapalı)</small></label>` : html`<label class="field"><span>Stok</span><input class="input" name="stock" type="number" inputmode="numeric" value="${p.stock}"></label>`}
        <label class="field"><span>Kritik stok uyarısı</span><input class="input" name="critical_stock" type="number" inputmode="numeric" value="${p.critical_stock || 0}"></label>
      </div>
      <label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Aktif (pasif ürünün stoğu kanallara gönderilmez)</label>
    </div>
    ${p.listings.length ? html`<div class="card flush"><div style="padding:16px 16px 0"><h3>Kanal ilanları</h3><p class="muted small" style="margin:4px 0 8px">Fiyat değişikliği kaydedilince ilgili kanala gönderilir. Komisyon boşsa kanal varsayılanı kullanılır; kanal siparişte gerçek komisyonu bildiriyorsa otomatik yazılır (elle girdiğiniz oran korunur). Kanala özel stok (ör. bir kanalda 10, diğerinde 5) için stok sütununa dokunun.</p></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Kanal</th><th class="r">Fiyat</th><th class="r">Komisyon %</th><th class="r">Ürün başı kâr</th><th class="r">Kanala giden stok</th></tr></thead><tbody>
        ${p.listings.map((l) => { const r = lp(l); return html`<tr data-l="${l.channel}" data-rid="${l.remote_id}">
          <td><span class="ch-name">${chLogo(l.channel, true)}${ch(l.channel).name}</span><div class="muted tiny ellipsis" style="max-width:180px">${l.remote_id}</div>${l.error ? html`<div class="tiny" style="color:var(--bad)">${l.error}</div>` : ''}</td>
          <td class="r"><input class="input qty-in" style="width:96px" inputmode="decimal" data-lf="price" value="${l.price ?? ''}"></td>
          <td class="r"><input class="input qty-in" inputmode="decimal" data-lf="commission" value="${l.commission ?? ''}" placeholder="${(st.commission || {})[l.channel] ?? 0}">${l.commission != null ? html`<div class="tiny muted">${l.commission_src === 'api' ? 'kanaldan (son sipariş)' : 'elle girildi'}</div>` : ''}</td>
          <td class="r num" data-lprofit style="font-weight:650;color:${r.unitProfit >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(r.unitProfit)}</td>
          <td class="r num"><button type="button" class="plain" data-rule style="align-items:flex-end">${l.desired ?? l.remote_stock ?? '—'}<span class="tiny muted">${ruleText(l) || 'ortak stok'}</span></button>${l.price_dirty ? html`<div class="tiny" style="color:var(--warn)">fiyat gönderilecek</div>` : ''}</td></tr>`; })}
      </tbody></table></div></div>` : ''}
    ${!id && ikasChannels.length ? html`<div class="card stack"><h3>Kanallarda oluştur</h3>
      ${ikasChannels.map((c) => html`<label class="check"><input type="checkbox" name="create_on" value="${c.id}"> ${c.name} (ikas) mağazasında da oluştur</label>`)}
      <p class="muted small" style="margin:0">Trendyol ve Hepsiburada'da ürün, kanalın kendi panelinden açılır; aynı barkod veya SKU ile açıldığında senkronda otomatik eşleşir.</p></div>` : ''}
    ${id ? html`<div class="two-col">
      <div class="card"><h3 style="margin-bottom:8px">Stok hareketleri</h3>${p.moves.length ? html`<table class="t"><tbody>${p.moves.map((m) => html`<tr><td class="small">${dateTime(m.created_at)}<div class="muted tiny">${m.reason}${m.ref ? ` · ${m.ref}` : ''}</div></td><td class="r num" style="font-weight:650;color:${m.delta > 0 ? 'var(--good)' : 'var(--bad)'}">${m.delta > 0 ? '+' : ''}${m.delta}</td><td class="r num muted">${m.stock_after ?? ''}</td></tr>`)}</tbody></table>` : html`<div class="muted small">Henüz hareket yok</div>`}</div>
      <div class="card"><h3 style="margin-bottom:8px">Son 30 gün satış</h3>${p.sales.length ? html`<table class="t"><tbody>${p.sales.map((x) => html`<tr><td>${ch(x.channel).name}</td><td class="r num">${x.qty} adet</td><td class="r num">${money(x.revenue)}</td></tr>`)}</tbody></table>` : html`<div class="muted small">Satış yok</div>`}</div>
    </div>` : ''}
  </form>`);
  s.setFoot(html`${id ? html`<button class="btn danger ghost" data-del>Sil</button>` : ''}<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>Kaydet</button>`);
  const form = $('[data-form]', s.body);
  form.addEventListener('click', (e) => { if (e.target.closest('[data-rule]')) ruleDialog(p, () => { s.close(); productForm(id, done); }); });
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
    for (const k of ['name', 'sku', 'barcode', 'brand', 'category', 'group_name', 'variant_name', 'image', 'description', 'purchase_price', 'sale_price', 'vat', 'desi', 'critical_stock']) b[k] = fd.get(k);
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
  const chs = activeChannels().filter((c) => c.enabled);
  const s = sheet({
    title: 'Kanallardan ürünleri içe aktar', size: 'narrow',
    body: html`<div class="stack">
      <p style="margin:0">Seçilen kanallardaki ürünler; görselleri ve varyantlarıyla çekilir. Barkodu veya SKU'su tek bir ürünle <b>kesin</b> uyuşan ilanlar otomatik eşleşir, emin olunamayanlar <a class="link" href="#/eslestirme">Eşleştirme</a> sayfasına düşer.</p>
      ${chs.map((c) => html`<label class="check"><input type="checkbox" value="${c.id}" checked> ${chLogo(c.id, true)}${c.name}${c.listings ? html` <span class="muted small">(${c.listings} ilan)</span>` : ''}</label>`)}
      <div class="notice small">İçe aktarma stokları değiştirmez. Eşleştirmeleri kontrol ettikten sonra Ayarlar'dan <b>stok senkronunu</b> açtığınızda panel stoğu tüm kanallara gönderilir.</div>
      <div data-res></div>
    </div>`,
    foot: html`<span class="spacer"></span><button class="btn" data-close>Kapat</button><button class="btn primary" data-go>İçe aktar</button>`,
  });
  $('[data-go]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
    const channels = $$('input[value]', s.body).filter((x) => x.checked).map((x) => x.value);
    const r = await api('import', { method: 'POST', body: { channels } });
    render($('[data-res]', s.body), html`<div class="notice good"><div>${Object.entries(r.channels).map(([k, v]) => html`<div>${ch(k).name}: ${typeof v === 'number' ? `${v} ilan` : v}</div>`)}<div style="margin-top:6px"><b>${r.created}</b> yeni ürün oluşturuldu (ana katalog kanalından), <b>${r.linked}</b> ilan otomatik eşleşti.</div><a class="btn sm" style="margin-top:8px" href="#/eslestirme">Bekleyen eşleştirmeler</a></div></div>`);
    done();
  });
}
