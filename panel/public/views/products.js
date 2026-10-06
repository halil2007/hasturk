// Ürünler: varyantlar ana ürün altında gruplanır; merkezi stok (her kanala kendi kuralıyla gönderilir), hızlı stok girişi,
// ürün ekleme/düzenleme, kanal ilanlarının fiyat/komisyonu ve kanallardan içe aktarma. Eşleştirme ayrı sayfadadır.
import { api, state, html, raw, render, $, $$, money, money0, n, ago, dateTime, ch, chColor, chLogo, thumb, isMobile, actions, busy, toast, sheet, debounce, confirmBox, numIn , activeChannels, popMenu } from '../core.js';
import { readSheet } from '../sheetread.js';
import { profit, costOf } from '../profit.js';
import { ruleDialog, ruleText } from './stocks.js';
import { setQuery } from '../app.js';

// Stok senkronu kapalıyken ana katalog (ikas) sitesindeki ilanı olan ürünün stoğu siteden okunur; panelde değiştirilmez
export const siteStock = (p) => !(state.settings && state.settings.stock_sync)
  && (p.listings || []).some((l) => ((state.settings && state.settings.catalog_channels) || ['ikas1']).includes(l.channel) && l.remote_stock != null);
export const siteStockVal = (p, cls = '') => html`<span class="val num ${cls}" style="cursor:help" title="ikas sitesinden okunur (stok senkronu kapalı). Adedi ikas panelinden değiştirin.">${p.stock}<span class="tiny muted" style="margin-left:4px;font-weight:500">ikas</span></span>`;

const FILTERS = [['', 'Tümü', 'all'], ['low', 'Kritik stok', 'low'], ['nocost', 'Alış fiyatı eksik', 'nocost'], ['nosku', 'SKU eksik', 'nosku'], ['nobarcode', 'Barkod eksik', 'nobarcode'], ['nolisting', 'Kanalda olmayan', 'nolisting'], ['passive', 'Pasif', 'passive']];
const SORTS = [['sold', 'En çok satan (30 gün)'], ['name', 'Ada göre (A–Z)'], ['new', 'En yeni eklenen'], ['stock', 'Stok (azdan çoğa)'], ['stock_desc', 'Stok (çoktan aza)'], ['price_desc', 'Fiyat (yüksekten)'], ['price_asc', 'Fiyat (düşükten)'], ['margin_desc', 'Marj (yüksekten)'], ['margin_asc', 'Marj (düşükten)']];

export async function products(el, rest, query = {}) {
  const f = { q: query.q || '', filter: query.f || (rest[0] === 'kritik' ? 'low' : ''), sort: query.sort || 'sold', page: 1 };
  let rows = [], total = 0, groupsTotal = 0, counts = {}, stats = {};
  const sel = new Set();
  render(el, html`<div class="stack">
    <div class="pstats" data-stats></div>
    <div class="card toolbar-card">
      <div class="row wrap page-actions">
        <div class="search grow"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün adı, SKU, barkod veya marka ara" data-q value="${f.q}"></div>
        <label class="sort-pick"><i class="ico ico-bars"></i><select data-sort aria-label="Sırala">${SORTS.map(([k, t]) => html`<option value="${k}" ${f.sort === k ? 'selected' : ''}>${t}</option>`)}</select></label>
        <button class="btn" data-act="tools"><i class="ico ico-gear"></i>Araçlar <i class="ico ico-down"></i></button>
        <button class="btn primary" data-act="new" data-fab><i class="ico ico-plus"></i>Ürün ekle</button>
      </div>
      <div class="fchips" data-filters></div>
    </div>
    <div class="card flush" data-box></div>
  </div>`);

  const stockCls = (p) => (p.stock <= 0 ? 'neg' : p.stock <= (p.low_limit ?? p.critical_stock) ? 'low' : '');
  const margin = (p) => (p.purchase_price && p.sale_price ? ((p.sale_price - p.purchase_price) / p.sale_price) * 100 : null);
  const marginPill = (m) => (m == null ? html`<span class="muted tiny">—</span>` : html`<span class="mpill ${m < 0 ? 'bad' : m < 15 ? 'amber' : 'good'}">%${n(m)}</span>`);
  const title = (p) => html`${p.variant_name && p.group_name ? p.group_name : p.name}${p.variant_name ? html`<span class="var-tag">${p.variant_name}</span>` : ''}`;
  const brand = (b) => (b ? html`<span class="brand-tag" title="Marka">${b}</span>` : '');
  const codes = (p) => html`<span class="codes">${p.sku ? html`<span title="Stok kodu (SKU)">${p.sku}</span>` : html`<span class="miss">SKU yok</span>`}${p.barcode ? html`<span title="Barkod">${p.barcode}</span>` : ''}</span>`;
  // Kanallar: logo yığını + kanal fiyat aralığı; ayrıntı ipucunda. Hata kırmızı, kanalda yoksa uyarı.
  function chans(list) {
    const ls = list.flatMap((p) => p.listings || []);
    if (!ls.length) return html`<span class="pill amber">Kanalda yok</span>`;
    const ids = [...new Set(ls.map((l) => l.channel))], err = ls.filter((l) => l.error);
    const prices = ls.map((l) => l.price).filter((x) => x > 0), lo = Math.min(...prices), hi = Math.max(...prices);
    const tip = ids.map((c) => { const xs = ls.filter((l) => l.channel === c); return `${ch(c).name}: ${xs.map((l) => money(l.price)).join(', ')}${xs.some((l) => l.error) ? ' (hata)' : ''}`; }).join('\n');
    return html`<div class="chstack" title="${tip}"><span class="logos">${ids.slice(0, 6).map((c) => chLogo(c, true))}${ids.length > 6 ? html`<span class="more">+${ids.length - 6}</span>` : ''}</span>
      <span class="small num">${prices.length ? (lo === hi ? money0(lo) : `${money0(lo)} – ${money0(hi)}`) : ''}</span>${err.length ? html`<span class="pill bad" title="${err.map((l) => `${ch(l.channel).name}: ${l.error}`).join('\n')}">${err.length} hata</span>` : ''}</div>`;
  }
  const stockCell = (p) => {
    const site = siteStock(p), c = stockCls(p);
    return html`<button class="stk ${c}" data-act="${site ? 'sitestock' : 'stock'}" data-id="${p.id}" title="${site ? 'ikas sitesinden okunur (stok senkronu kapalı)' : 'Stok girişi / sayım'}"><span class="dot"></span><b class="num">${p.stock}</b></button>${p.days_left != null && p.stock > 0 ? html`<div class="tiny ${p.days_left <= 14 ? 'down' : 'muted'}">≈ ${p.days_left} gün</div>` : ''}`;
  };
  const opened = new Set();
  const groupList = () => { const m = new Map(); for (const p of rows) { const k = p.gk || p.group_name || p.name; if (!m.has(k)) m.set(k, []); m.get(k).push(p); } return [...m]; };
  const isGroup = (list) => list.length > 1;
  const range = (vals) => { const v = vals.filter((x) => x > 0); if (!v.length) return '—'; const lo = Math.min(...v), hi = Math.max(...v); return lo === hi ? money(lo) : `${money0(lo)} – ${money0(hi)}`; };
  const gStock = (list) => list.reduce((a, p) => a + Math.max(0, p.stock), 0);
  const cb = (p) => html`<input type="checkbox" class="cb" data-sel="${p.id}" ${sel.has(p.id) ? 'checked' : ''} aria-label="Seç">`;
  const kebab = (p) => html`<button class="icon-btn sm" data-act="menu" data-id="${p.id}" aria-label="İşlemler"><i class="ico ico-dots"></i></button>`;

  function drawStats() {
    const s = stats, c = counts;
    const missing = (s.nocost || 0) + (s.nosku || 0) + (s.nobarcode || 0);
    render($('[data-stats]', el), html`
      <button class="pstat" data-act="filter" data-k=""><span class="ic blue"><i class="ico ico-box"></i></span><div><b class="num">${n(c.all || 0)}</b><span>aktif ürün${s.passive ? ` · ${n(s.passive)} pasif` : ''}</span></div></button>
      <div class="pstat"><span class="ic green"><i class="ico ico-calc"></i></span><div><b class="num">${money0(s.stock_value || 0)}</b><span>stok değeri (alış) · satışla ${money0(s.sale_value || 0)}</span></div></div>
      <div class="pstat"><span class="ic purple"><i class="ico ico-pie"></i></span><div><b class="num">${s.margin == null ? '—' : `%${n(s.margin)}`}</b><span>ortalama marj</span></div></div>
      <button class="pstat ${c.out || c.below ? 'warn' : ''}" data-act="filter" data-k="low"><span class="ic red"><i class="ico ico-db"></i></span><div><b class="num">${n((c.out || 0) + (c.below || 0))}</b><span>kritik stok · ${n(c.out || 0)} tükendi</span></div></button>
      <button class="pstat ${missing ? 'warn' : ''}" data-act="filter" data-k="${s.nocost ? 'nocost' : s.nosku ? 'nosku' : 'nobarcode'}"><span class="ic amber"><i class="ico ico-warn"></i></span><div><b class="num">${n(missing)}</b><span>eksik bilgi (alış ${n(s.nocost || 0)} · SKU ${n(s.nosku || 0)} · barkod ${n(s.nobarcode || 0)})</span></div></button>`);
    const cnt = { all: c.all, low: (c.out || 0) + (c.below || 0), nocost: s.nocost, nosku: s.nosku, nobarcode: s.nobarcode, nolisting: s.nolisting, passive: s.passive };
    render($('[data-filters]', el), html`${FILTERS.map(([k, t, ck]) => html`<button class="fchip ${f.filter === k ? 'on' : ''}" data-act="filter" data-k="${k}">${t}${cnt[ck] ? html`<span class="n">${n(cnt[ck])}</span>` : ''}</button>`)}`);
  }

  function bulkbar() {
    if (!sel.size) return '';
    return html`<div class="bulk"><b>${sel.size} ürün seçildi</b>
      <button class="btn sm" data-act="bulk" data-a="activate"><i class="ico ico-check"></i>Aktif yap</button>
      <button class="btn sm" data-act="bulk" data-a="deactivate"><i class="ico ico-minus"></i>Pasife al</button>
      <button class="btn sm" data-act="bulk" data-a="critical"><i class="ico ico-db"></i>Kritik stok sınırı</button>
      <span class="spacer"></span><button class="btn sm ghost" data-act="clearsel">Seçimi kaldır</button></div>`;
  }
  function draw() {
    drawStats();
    const mob = isMobile(), gl = groupList(), all = !!f.q;
    const prow = (p, variant = false) => { const m = margin(p); return html`<tr class="${variant ? 'var-row' : ''} ${sel.has(p.id) ? 'sel-row' : ''} click" data-pid="${p.id}" data-row-edit="${p.id}">
      <td class="cbcol">${cb(p)}</td>
      <td><div class="prod-cell">${thumb(p.image, p.name, variant ? 'sm' : '')}<div style="min-width:0"><div class="pname">${variant && p.variant_name ? html`<span class="var-tag" style="margin-left:0">${p.variant_name}</span>` : title(p)}${p.active ? '' : html` <span class="pill">Pasif</span>`}</div><div class="psub">${variant ? '' : brand(p.brand)}${codes(p)}</div></div></div></td>
      <td>${chans([p])}</td>
      <td class="r num">${p.purchase_price ? money(p.purchase_price) : html`<span class="miss" title="Alış fiyatı girilmedi; kâr hesaplanamaz">girilmedi</span>`}</td>
      <td class="r num"><b>${money(p.sale_price)}</b>${p.currency && p.fx_price ? html`<div class="tiny muted">${p.fx_price} ${p.currency}</div>` : ''}</td>
      <td class="r">${marginPill(m)}</td>
      <td class="c">${stockCell(p)}</td>
      <td class="r">${kebab(p)}</td></tr>`; };
    const head = ([k, list], i) => { const p0 = list[0], on = all || opened.has(k), low = list.some((p) => stockCls(p)), gname = p0.group_name || p0.name, allSel = list.every((p) => sel.has(p.id));
      return html`<tr class="grp-head click ${on ? 'on' : ''}" data-act="vedit" data-gi="${i}" title="Tüm varyantları birlikte düzenle">
        <td class="cbcol"><input type="checkbox" class="cb" data-gsel="${i}" ${allSel ? 'checked' : ''} aria-label="Varyantları seç"></td>
        <td><div class="prod-cell"><button class="icon-btn sm grp-tog" data-act="tog" data-gi="${i}" aria-label="${on ? 'Varyantları gizle' : 'Varyantları göster'}" title="${on ? 'Varyantları gizle' : 'Varyantları listede göster'}"><i class="ico ico-down grp-chev"></i></button>${thumb(list.find((p) => p.image)?.image || '', gname)}<div style="min-width:0"><div class="pname">${gname}</div><div class="psub">${brand(list.find((p) => p.brand)?.brand)}<span class="pill info" style="padding:1px 8px">${list.length} varyant</span>${list.length <= 4 ? html`<span class="muted tiny ellipsis">${list.map((p) => p.variant_name || p.sku || '').filter(Boolean).join(', ')}</span>` : ''}</div></div></div></td>
        <td>${chans(list)}</td>
        <td class="r num muted">${range(list.map((p) => p.purchase_price))}</td>
        <td class="r num"><b>${range(list.map((p) => p.sale_price))}</b></td>
        <td class="r muted">—</td>
        <td class="c"><span class="stk ${low ? 'low' : ''}" title="Varyantların toplam stoğu"><span class="dot"></span><b class="num">${gStock(list)}</b></span></td>
        <td class="r"><button class="btn sm outline" data-act="vedit" data-gi="${i}"><i class="ico ico-gear"></i>Varyantları düzenle</button></td></tr>
        ${on ? list.map((p) => prow(p, true)) : ''}`; };
    const mCard = ([k, list], i) => { if (!isGroup(list)) { const p = list[0]; return html`<div class="m-card" data-pid="${p.id}">
          <div class="top" data-act="edit" data-id="${p.id}" style="cursor:pointer">${thumb(p.image, p.name)}<div style="min-width:0;flex:1"><div class="ellipsis" style="font-weight:650">${p.name}</div><div class="psub">${brand(p.brand)}${codes(p)}</div></div></div>
          <div class="row">${chans([p])}<span class="spacer"></span>${marginPill(margin(p))}</div>
          <div class="row"><span class="small muted">Satış <b style="color:var(--text)">${money(p.sale_price)}</b>${p.purchase_price ? html` · alış ${money(p.purchase_price)}` : ''}</span><span class="spacer"></span>${stockCell(p)}</div></div>`; }
      const on = all || opened.has(k), gname = list[0].group_name || list[0].name;
      return html`<div class="m-card grp ${on ? 'on' : ''}">
        <div class="top" data-act="tog" data-gi="${i}" style="cursor:pointer">${thumb(list.find((p) => p.image)?.image || '', gname)}<div style="min-width:0;flex:1"><div class="ellipsis" style="font-weight:700">${gname}</div><div class="muted tiny">${brand(list.find((p) => p.brand)?.brand)}${list.length} varyant · ${range(list.map((p) => p.sale_price))} · stok ${gStock(list)}</div></div><i class="ico ico-down grp-chev"></i></div>
        ${on ? html`<div class="m-vars"><button class="btn sm outline block" data-act="vedit" data-gi="${i}"><i class="ico ico-gear"></i>Tüm varyantları birlikte düzenle</button>${list.map((p) => html`<div class="m-var" data-pid="${p.id}"><div style="min-width:0;flex:1" data-act="edit" data-id="${p.id}"><span class="var-tag" style="margin-left:0">${p.variant_name || p.name}</span><div class="muted tiny">${p.sku || ''} · ${money(p.sale_price)}</div></div>${stockCell(p)}</div>`)}</div>` : ''}</div>`; };
    const empty = html`<div class="empty-state"><div class="ic"><i class="ico ico-box"></i></div><b>${f.q || f.filter ? 'Bu filtrede ürün yok' : 'Henüz ürün yok'}</b>
      <span>${f.q || f.filter ? 'Aramayı ya da filtreyi değiştirin.' : 'Kanallarınızdaki ürünleri Kanal Ürünleri sayfasından seçip ekleyebilir ya da yeni ürün açabilirsiniz.'}</span>
      ${f.q || f.filter ? '' : html`<div class="row" style="justify-content:center"><a class="btn" href="#/kanal-urunleri"><i class="ico ico-grid"></i>Kanal Ürünleri</a><button class="btn primary" data-act="new"><i class="ico ico-plus"></i>Ürün ekle</button></div>`}</div>`;
    const allSel = rows.length && rows.every((p) => sel.has(p.id));
    const body = !rows.length ? empty
      : mob ? html`<div class="m-list">${gl.map(mCard)}</div>`
        : html`<div class="table-wrap"><table class="t prod-t"><thead><tr><th class="cbcol"><input type="checkbox" class="cb" data-selall ${allSel ? 'checked' : ''} aria-label="Tümünü seç"></th><th>Ürün</th><th>Kanallar</th><th class="r">Alış</th><th class="r">Satış</th><th class="r">Marj</th><th class="c">Stok</th><th></th></tr></thead><tbody>
          ${gl.map((g, i) => (isGroup(g[1]) ? head(g, i) : prow(g[1][0])))}
        </tbody></table></div>`;
    const shown = gl.length;
    render($('[data-box]', el), html`${bulkbar()}${body}${rows.length ? html`<div class="pager"><span class="muted small" style="margin-right:auto">${n(groupsTotal)} ana ürün · ${n(total)} ürün/varyant${shown < groupsTotal ? ` · ${shown} gösteriliyor` : ''}</span>${gl.some((g) => isGroup(g[1])) && !all ? html`<button class="btn sm ghost" data-act="togall">${opened.size ? 'Varyantları kapat' : 'Tüm varyantları aç'}</button>` : ''}${shown < groupsTotal ? html`<button class="btn sm" data-act="more">Daha fazla göster</button>` : ''}</div>` : ''}`);
  }
  async function load(append = false) {
    setQuery({ f: f.filter, q: f.q, sort: f.sort === 'sold' ? '' : f.sort });
    const p = new URLSearchParams({ page: f.page, limit: 40, group: 1 });
    if (f.q) p.set('q', f.q);
    if (f.filter) p.set('filter', f.filter);
    if (f.sort) p.set('sort', f.sort);
    const r = await api('products?' + p);
    rows = append ? rows.concat(r.products) : r.products;
    total = r.total; groupsTotal = r.groups ?? r.total; counts = r.counts || {}; stats = r.stats || {};
    draw();
  }
  const refresh = () => { f.page = 1; return load().catch((e) => toast(e.message, true)); };
  const byId = (id) => rows.find((x) => x.id === Number(id));
  const unl = () => (state.summary ? state.summary.unmatched : 0);
  actions(el, {
    filter: (t) => { f.filter = t.dataset.k; sel.clear(); refresh(); },
    tog: (t) => { const g = groupList()[Number(t.dataset.gi)]; if (!g) return; if (opened.has(g[0])) opened.delete(g[0]); else opened.add(g[0]); draw(); },
    vedit: (t) => { const g = groupList()[Number(t.dataset.gi)]; if (g) variantEditor(g[1].map((p) => p.id), refresh, g[1][0].group_name || g[1][0].name); },
    togall: () => { if (opened.size) opened.clear(); else groupList().forEach(([k]) => opened.add(k)); draw(); },
    more: () => { f.page++; load(true); },
    stock: (t) => stockDialog(byId(t.dataset.id), refresh),
    sitestock: () => toast('Stok, ikas sitesinden okunuyor (stok senkronu kapalı). Adedi ikas panelinden değiştirin ya da Ayarlar → Stok\'tan senkronu açın.'),
    edit: (t) => productForm(Number(t.dataset.id), refresh),
    new: () => productForm(0, refresh),
    clearsel: () => { sel.clear(); draw(); },
    menu: (t) => {
      const p = byId(t.dataset.id);
      if (!p) return;
      const grp = groupList().find(([, l]) => l.length > 1 && l.some((x) => x.id === p.id));
      popMenu(t, [
        { icon: 'gear', label: 'Düzenle', run: () => productForm(p.id, refresh) },
        ...(grp ? [{ icon: 'grid', label: `Tüm varyantları birlikte düzenle (${grp[1].length})`, run: () => variantEditor(grp[1].map((x) => x.id), refresh, grp[1][0].group_name || grp[1][0].name) }] : []),
        siteStock(p) ? { icon: 'db', label: 'Stok ikas\'tan okunuyor', run: () => {} } : { icon: 'db', label: 'Stok girişi / sayım', run: () => stockDialog(p, refresh) },
        ...((p.listings || []).length ? [{ icon: 'link', label: 'Kanal stok kuralları', run: () => ruleDialog(p, refresh) }] : []),
        { icon: p.active ? 'minus' : 'check', label: p.active ? 'Pasife al' : 'Aktif yap', run: () => api('products-bulk', { method: 'POST', body: { ids: [p.id], action: p.active ? 'deactivate' : 'activate' } }).then(() => { toast(p.active ? 'Pasife alındı' : 'Aktif yapıldı'); refresh(); }).catch((e) => toast(e.message, true)) },
      ], { title: p.name });
    },
    bulk: async (t) => {
      const a = t.dataset.a;
      let value;
      if (a === 'critical') { value = prompt('Seçili ürünlerin kritik stok sınırı (adet):', '5'); if (value === null) return; }
      else if (!(await confirmBox(`${sel.size} ürün ${a === 'activate' ? 'aktif yapılsın' : 'pasife alınsın'} mı?${a === 'deactivate' ? ' Pasif ürünler listelerde gizlenir, stok gönderimi durmaz.' : ''}`, a === 'activate' ? 'Aktif yap' : 'Pasife al'))) return;
      busy(t, async () => { const r = await api('products-bulk', { method: 'POST', body: { ids: [...sel], action: a, value } }); toast(`${n(r.changed)} ürün güncellendi`); sel.clear(); refresh(); });
    },
    tools: (t) => popMenu(t, [
      { icon: 'grid', label: 'Kanal ürünlerinden seç / ekle', run: () => { location.hash = '#/kanal-urunleri'; } },
      { icon: 'link', label: `Eşleştirme${unl() ? ` (${unl()} bekliyor)` : ''}`, run: () => { location.hash = '#/eslestirme'; } },
      '-',
      { icon: 'tag', label: 'Barkod / SKU oluştur', run: () => barcodeDialog(refresh, f.filter === 'nosku' ? 'sku' : 'barcode') },
      { icon: 'download', label: 'Excel\'e aktar (tüm ürünler)', run: () => { location.href = '/api/products.csv'; } },
      { icon: 'upload', label: 'Excel\'den toplu güncelle', run: () => excelDialog(refresh) },
      { icon: 'sync', label: 'Kanallardan içe aktar', run: () => importDialog(refresh) },
    ], { title: 'Araçlar' }),
  });
  // Satıra tıklayınca ürün açılır (kutucuk, düğme ve bağlantılar hariç)
  el.addEventListener('click', (e) => {
    const r = e.target.closest('[data-row-edit]');
    if (!r || e.target.closest('button, a, input, select, label')) return;
    productForm(Number(r.dataset.rowEdit), refresh);
  });
  el.addEventListener('change', (e) => {
    const c = e.target.closest('[data-sel]');
    if (c) { c.checked ? sel.add(Number(c.dataset.sel)) : sel.delete(Number(c.dataset.sel)); draw(); return; }
    const g = e.target.closest('[data-gsel]');
    if (g) { const list = (groupList()[Number(g.dataset.gsel)] || [])[1] || []; list.forEach((p) => (g.checked ? sel.add(p.id) : sel.delete(p.id))); draw(); return; }
    if (e.target.matches('[data-selall]')) { rows.forEach((p) => (e.target.checked ? sel.add(p.id) : sel.delete(p.id))); draw(); }
    if (e.target.matches('[data-sort]')) { f.sort = e.target.value; refresh(); }
  });
  el.addEventListener('click', (e) => { if (e.target.closest('[data-gsel]')) e.stopPropagation(); }, true);
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

// CSS url() içine giden adres: tırnak / parantez / ters bölü atılır (stil enjeksiyonu olmasın)
const cssUrl = (u) => String(u || '').replace(/['"()\\\s]/g, '');
// Kanaldan gelen HTML açıklama: izin verilen biçim etiketleriyle YENİ bir belge kurulur (yorum, betik, noscript gibi her şey atılır;
// bilinmeyen etiketin yalnız metni kalır). Ayrıştırılan belge doğrudan yeniden yazılmadığı için "mutation XSS" oluşmaz.
const OK_TAGS = new Set('P BR B STRONG I EM U S UL OL LI H1 H2 H3 H4 H5 H6 TABLE THEAD TBODY TFOOT TR TD TH CAPTION SPAN DIV A IMG BLOCKQUOTE HR SMALL SUB SUP'.split(' '));
const OK_ATTR = { A: ['href', 'title'], IMG: ['src', 'alt', 'title', 'width', 'height'], TD: ['colspan', 'rowspan'], TH: ['colspan', 'rowspan'] };
const DROP_TAGS = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|IFRAME|FRAME|OBJECT|EMBED|SVG|MATH|TEXTAREA|TITLE|XMP|NOEMBED|NOFRAMES|SELECT|OPTION|BUTTON|FORM|INPUT|LINK|META|BASE)$/;
function safeHtml(src) {
  const doc = new DOMParser().parseFromString(String(src || ''), 'text/html');
  const out = document.implementation.createHTMLDocument('');
  const copy = (from, to) => {
    for (const n of from.childNodes) {
      if (n.nodeType === 3) { to.appendChild(out.createTextNode(n.textContent)); continue; }
      if (n.nodeType !== 1) continue; // yorum ve diğer düğümler atılır
      const tag = String(n.tagName).toUpperCase();
      if (DROP_TAGS.test(tag)) continue;
      if (!OK_TAGS.has(tag)) { copy(n, to); continue; }
      const e = out.createElement(tag.toLowerCase());
      for (const a of OK_ATTR[tag] || []) {
        const v = n.getAttribute(a);
        if (v == null || ((a === 'href' || a === 'src') && !/^https?:\/\//i.test(v.trim()))) continue;
        e.setAttribute(a, v);
      }
      if (tag === 'A') { e.setAttribute('target', '_blank'); e.setAttribute('rel', 'noopener noreferrer'); }
      to.appendChild(e);
      copy(n, e);
    }
  };
  copy(doc.body, out.body);
  return out.body.innerHTML;
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
    return profit({ sale: l.price, purchase: numIn($('[name=purchase_price]', s.body)?.value ?? p.purchase_price), commissionRate: rate, shipping: costOf(st, 'shipping', l.channel), fee: costOf(st, 'service_fee', l.channel), feeRate: costOf(st, 'fee_rate', l.channel), withholdingRate: costOf(st, 'withholding', l.channel) });
  };
  s.setBody(html`<form class="stack" data-form>
    ${(p.siblings || []).length > 1 ? html`<div class="notice"><i class="ico ico-grid"></i><div><b>${p.group_name || p.name}</b> ana ürününün ${p.siblings.length} varyantından biri. Fiyat, stok ve kanal fiyatlarını tüm varyantlarda tek ekrandan değiştirebilirsiniz.</div><button class="btn sm primary" type="button" data-allvar>Tüm varyantları düzenle</button></div>` : ''}
    <div class="card stack">
      <h3>Ürün bilgileri</h3>
      <label class="field"><span>Ürün adı *</span><input class="input" name="name" required value="${p.name}"></label>
      <div class="form-grid">
        <label class="field"><span>Stok kodu (SKU)</span><div class="row" style="gap:6px;flex-wrap:nowrap"><input class="input" name="sku" value="${p.sku || ''}" placeholder="kanallarla aynı olmalı" style="flex:1;min-width:0"><button type="button" class="btn sm" data-gensku title="Ürün adından SKU oluştur">Oluştur</button></div></label>
        <label class="field"><span>Barkod</span><div class="row" style="gap:6px;flex-wrap:nowrap"><input class="input" name="barcode" value="${p.barcode || ''}" style="flex:1;min-width:0"><button type="button" class="btn sm" data-genbc title="Benzersiz EAN-13 barkod oluştur">Oluştur</button></div></label>
        <label class="field"><span>Marka</span><input class="input" name="brand" value="${p.brand || ''}"></label>
        <label class="field"><span>Kategori</span><input class="input" name="category" value="${p.category || ''}" placeholder="ikas'tan gelir"><small>Pazaryerine yüklemede kategori eşleştirmesi buna göre yapılır</small></label>
        <label class="field"><span>Ana ürün (varyant grubu)</span><input class="input" name="group_name" value="${p.group_name || ''}" placeholder="varyantlar bu adla gruplanır"></label>
        <label class="field"><span>Varyant</span><input class="input" name="variant_name" value="${p.variant_name || ''}" placeholder="ör. 5 kg / Kırmızı"></label>
      </div>
      <label class="field"><span>Görsel adresi</span><input class="input" name="image" value="${p.image || ''}" placeholder="https://…"></label>
      <div class="field" data-gal><span>Tüm görseller</span><div data-galbox></div></div>
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
      ${state.tenant ? html`<div class="notice small"><i class="ico ico-tag"></i><div><b>Döviz bazlı fiyat</b> (dolar / euro / sterlin fiyatı, kurla otomatik güncelleme) <span class="pill info">Yakında</span></div></div>` : html`<div class="stack" style="gap:8px;border:1px dashed var(--line);border-radius:10px;padding:10px 12px">
        <div class="row wrap" style="gap:8px"><b class="small">Döviz bazlı fiyat</b><span class="muted tiny">Döviz seçilirse TL satış fiyatı ve kanal fiyatları kurla otomatik güncellenir (Ayarlar → Döviz ve fiyat).</span></div>
        <div class="form-grid">
          <label class="field"><span>Fiyat para birimi</span><select class="input" name="currency" data-fx>${[['', 'TL (döviz yok)'], ['USD', 'Dolar ($)'], ['EUR', 'Euro (€)'], ['GBP', 'Sterlin (£)']].map(([v, t]) => html`<option value="${v}" ${(p.currency || '') === v ? 'selected' : ''}>${t}</option>`)}</select></label>
          <label class="field"><span>Döviz fiyatı</span><input class="input" name="fx_price" inputmode="decimal" value="${p.fx_price || ''}" data-fx placeholder="ör. 12,50"></label>
          <label class="field"><span>Kâr payı % (boşsa genel ayar)</span><input class="input" name="fx_margin" inputmode="decimal" value="${p.fx_margin ?? ''}" data-fx></label>
        </div>
        <div class="small" data-fxprev></div></div>`}
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
  const allv = $("[data-allvar]", s.body);
  if (allv) allv.onclick = () => { s.close(); variantEditor(p.siblings, done, p.group_name || p.name); };
  s.setFoot(html`${id ? html`<button class="btn danger ghost" data-del>Sil</button>` : ''}<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>Kaydet</button>`);
  const form = $('[data-form]', s.body);
  // Görsel galerisi: yalnız bağlantılar saklanır (görseller kanalın sunucusundan açılır, panelde yer kaplamaz)
  let gal = (() => { try { return JSON.parse(p.images || '[]'); } catch { return []; } })(), galManual = !!p.images_manual, galEdit = false, galDirty = false, galAuto = false;
  const drawGal = () => render($('[data-galbox]', form), html`<div class="stack" style="gap:8px">
    ${gal.length ? html`<div class="row wrap" style="gap:6px">${gal.map((u, i) => html`<a href="${u}" target="_blank" rel="noopener" title="${i === 0 ? 'Ana görsel · ' : ''}${u}" style="position:relative"><span class="thumb lg" style="background-image:url('${cssUrl(u)}')"></span>${i === 0 ? html`<span class="pill" style="position:absolute;left:2px;bottom:2px;font-size:9px;padding:0 4px">ana</span>` : ''}</a>`)}</div>`
      : html`<div class="muted small">${id ? 'Henüz görsel bağlantısı yok; bağlı kanallardan bir sonraki senkronda gelir.' : 'Kaydettikten sonra bağlı kanallardan gelir ya da aşağıdan ekleyin.'}</div>`}
    <div class="row wrap" style="gap:8px"><span class="muted tiny" style="flex:1">${gal.length ? `${gal.length} görsel · ` : ''}${galAuto ? 'kaydedince kanaldan otomatik alınacak' : galManual ? 'panelde düzenlendi (senkron değiştirmez)' : 'kanaldan otomatik (ana katalog önce)'} · yalnız bağlantı saklanır, yer kaplamaz</span>
      <button type="button" class="btn sm" data-galedit>${galEdit ? 'Düzenlemeyi kapat' : 'Bağlantıları düzenle'}</button>${galManual && !galAuto ? html`<button type="button" class="btn sm ghost" data-galauto>Kanaldan otomatik al</button>` : ''}</div>
    ${galEdit ? html`<textarea class="input" data-galtext rows="5" placeholder="Her satıra bir görsel bağlantısı (https://…). İlk satır ana görsel.">${gal.join('\n')}</textarea>` : ''}
  </div>`);
  drawGal();
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-galedit]')) { galEdit = !galEdit; drawGal(); }
    if (e.target.closest('[data-galauto]')) { galAuto = true; galDirty = false; galManual = false; galEdit = false; drawGal(); }
  });
  form.addEventListener('input', (e) => {
    if (!e.target.matches('[data-galtext]')) return;
    gal = [...new Set(e.target.value.split(/[\s,]+/).map((x) => x.trim()).filter((x) => /^https?:\/\//i.test(x)))].slice(0, 12);
    galDirty = true; galAuto = false; galManual = true;
    const box = $('[data-galbox] .row', form); // önizlemeyi yazarken yeniden çizme (imleç kaybolmasın)
    if (box && box.firstElementChild && box.firstElementChild.tagName === 'A') render(box, html`${gal.map((u) => html`<a href="${u}" target="_blank" rel="noopener"><span class="thumb lg" style="background-image:url('${cssUrl(u)}')"></span></a>`)}`);
  });
  // SKU oluştur: formdaki ad / varyant / markadan benzersiz öneri; kaydedilince geçerli olur
  $('[data-gensku]', form).onclick = (e) => busy(e.currentTarget, async () => {
    if (form.sku.value.trim() && !(await confirmBox((p.listings || []).length
      ? 'Ürünün SKU\'su var ve kanallarda ilanı bağlı. SKU yalnız panelde değişir; pazaryerindeki ilanın SKU\'su değişmez ve eşleşme SKU ile yapılıyorsa bozulabilir. Yine de değiştirilsin mi?'
      : 'Mevcut SKU\'nun yerine yeni SKU yazılsın mı?', 'Yeni SKU'))) return;
    const q = new URLSearchParams({ name: form.name.value, group_name: form.group_name.value, variant_name: form.variant_name.value, brand: form.brand.value, id: id || '' });
    form.sku.value = (await api('products/skus/new?' + q)).sku;
    toast('SKU oluşturuldu — kaydetmeyi unutmayın');
  });
  // Barkod oluştur: benzersiz EAN-13 önerisi alanına yazılır, ürün kaydedilince geçerli olur
  $('[data-genbc]', form).onclick = (e) => busy(e.currentTarget, async () => {
    if (form.barcode.value.trim() && !(await confirmBox((p.listings || []).length
      ? 'Ürünün barkodu var ve kanallarda ilanı bağlı. Yeni barkod yalnız panelde değişir; pazaryerlerindeki ilanın barkodu değişmez. Yine de değiştirilsin mi?'
      : 'Mevcut barkodun yerine yeni barkod yazılsın mı?', 'Yeni barkod'))) return;
    const r = await api('products/barcodes/new');
    form.barcode.value = r.barcode;
    toast('Barkod oluşturuldu — kaydetmeyi unutmayın');
  });
  form.addEventListener('click', (e) => { if (e.target.closest('[data-rule]')) ruleDialog(p, () => { s.close(); productForm(id, done); }); });
  form.addEventListener('input', () => {
    $$('tr[data-l]', form).forEach((tr) => {
      const l = { channel: tr.dataset.l, price: numIn($('[data-lf=price]', tr).value), commission: $('[data-lf=commission]', tr).value === '' ? null : numIn($('[data-lf=commission]', tr).value) };
      const r = lp(l), c = $('[data-lprofit]', tr);
      c.textContent = money(r.unitProfit); c.style.color = r.unitProfit >= 0 ? 'var(--good)' : 'var(--bad)';
    });
  });
  form.onsubmit = (e) => e.preventDefault();
  // Döviz fiyatı önizlemesi: güncel kur × döviz fiyatı × (1 + kâr payı) → yaklaşık TL fiyat
  let fxInfo = null;
  const fxPrev = () => {
    const box = $('[data-fxprev]', form); if (!box) return;
    const c = form.currency.value, fp = numIn(form.fx_price.value);
    if (!c || !(fp > 0)) return render(box, html`<span class="muted">Döviz seçilmedi: fiyat TL olarak elle girilir.</span>`);
    const fx = fxInfo && fxInfo.settings, r = fxInfo && fxInfo.rates && fxInfo.rates.rates && fxInfo.rates.rates[c];
    if (!r) return render(box, html`<span class="muted">Kur bilgisi alınamadı${fxInfo && fxInfo.error ? `: ${fxInfo.error}` : ''}; kaydedince kur yeniden denenir.</span>`);
    const rate = r[fx.kind] || r.sell, mg = form.fx_margin.value.trim() === '' ? fx.margin : numIn(form.fx_margin.value);
    render(box, html`≈ <b>${money(fp * rate * (1 + (mg || 0) / 100))}</b> <span class="muted">(${c} ${rate.toFixed(4)} · ${fxInfo.rates.source === 'live' ? 'anlık kur' : `TCMB ${fxInfo.rates.date || ''}`}${mg ? ` · kâr payı %${mg}` : ''}) — kaydedince satış fiyatı ve kanal fiyatları bu kurla güncellenir</span>`);
  };
  if ($('[data-fxprev]', form)) { api('fx').then((r) => { fxInfo = r; fxPrev(); }).catch(() => fxPrev()); form.addEventListener('input', (e) => { if (e.target.dataset.fx !== undefined) fxPrev(); }); form.addEventListener('change', (e) => { if (e.target.dataset.fx !== undefined) fxPrev(); }); fxPrev(); }
  $('[data-save]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
    const fd = new FormData(form), b = {};
    for (const k of ['name', 'sku', 'barcode', 'brand', 'category', 'group_name', 'variant_name', 'image', 'description', 'purchase_price', 'sale_price', 'vat', 'desi', 'critical_stock']) b[k] = fd.get(k);
    for (const k of ['purchase_price', 'sale_price', 'desi']) b[k] = numIn(b[k]);
    b.active = fd.get('active') ? 1 : 0;
    if (form.currency) { b.currency = fd.get('currency') || ''; b.fx_price = numIn(fd.get('fx_price')); b.fx_margin = String(fd.get('fx_margin') || '').trim() === '' ? '' : numIn(fd.get('fx_margin')); }
    if (!b.name.trim()) return toast('Ürün adı gerekli', true);
    // Stok alanı yalnız panelde tutulan stokta vardır (ikas'tan okunan stok salt okunur, gönderilmez)
    if (fd.has('stock') && (!id || Number(fd.get('stock')) !== p.stock)) b.stock = Number(fd.get('stock')) || 0;
    b.listings = $$('tr[data-l]', form).map((tr) => ({ channel: tr.dataset.l, remote_id: tr.dataset.rid, price: numIn($('[data-lf=price]', tr).value), commission: $('[data-lf=commission]', tr).value }));
    b.create_on = fd.getAll('create_on');
    if (galAuto) b.images_auto = 1; else if (galDirty) b.images = gal;
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

// Toplu kod oluşturma (Barkod / SKU sekmeleri): kodu olmayan ürünlerden seçilenlere benzersiz kod verilir.
// Barkod: geçerli EAN-13. SKU: ürün adından okunabilir kod; öneriler önizlenir ve kaydetmeden önce elle değiştirilebilir.
async function barcodeDialog(done, kind = 'barcode') {
  const s = sheet({ title: 'Barkod / SKU oluştur', size: 'wide', body: html`<div class="empty"><i class="ico ico-sync spin"></i></div>` });
  let list = [], info = {}, q = '', prefix = '';
  const sel = new Set(), sku = new Map();
  const label = (p) => [p.variant_name && p.group_name ? p.group_name : p.name, p.variant_name].filter(Boolean).join(' · ');
  const shown = () => (q ? list.filter((p) => `${label(p)} ${p.sku || ''} ${p.barcode || ''}`.toLocaleLowerCase('tr').includes(q)) : list);
  async function load() {
    s.setBody(html`<div class="empty"><i class="ico ico-sync spin"></i></div>`); s.setFoot(null);
    sel.clear(); sku.clear(); q = '';
    const [i, r] = await Promise.all([api(kind === 'sku' ? 'products/skus' : 'products/barcodes'), api(`products?filter=${kind === 'sku' ? 'nosku' : 'nobarcode'}&limit=500`)]);
    info = i; list = r.products; prefix = i.prefix || '';
    if (kind === 'sku') await preview();
    draw();
  }
  async function preview() {
    if (!list.length) return;
    const r = await api('products/skus/preview', { method: 'POST', body: { ids: list.map((p) => p.id), prefix } });
    prefix = r.prefix; sku.clear(); r.items.forEach((x) => sku.set(x.id, x.sku));
  }
  function draw() {
    const v = shown(), isSku = kind === 'sku';
    s.setBody(html`<div class="stack">
      <div class="tabs"><button class="tab ${!isSku ? 'on' : ''}" data-kind="barcode">Barkod (EAN-13)</button><button class="tab ${isSku ? 'on' : ''}" data-kind="sku">SKU (stok kodu)</button></div>
      <div class="notice small"><i class="ico ico-tag"></i><div>${isSku
        ? html`SKU <b>ürün adından</b> oluşur: <b>ön ek – kısaltma – miktar/varyant</b> (ör. “HasTürk Solucan Gübresi - 15 Kg” → <b>HG-SOGU-15KG</b>; marka adı ve parantez içi kısaltmaya girmez). Öneriler panel ürünleri ve tüm kanal ilanlarıyla çakışmaz; kaydetmeden önce kutudan değiştirebilirsiniz. SKU'su dolu ürünler değişmez.`
        : html`Seçtiğiniz ürünlere <b>benzersiz, geçerli EAN-13</b> barkod verilir (son hane kontrol hanesi). Panel ürünleri ve tüm kanal ilanlarıyla çakışmaz. Ön ek <b>200</b>, mağaza içi kullanıma ayrılmış aralıktır; gerçek bir firmanın barkoduyla çakışmaz. GS1 firma önekiniz varsa onu yazın. Barkodu dolu ürünler değişmez.`}</div></div>
      ${!list.length ? html`<div class="empty">${isSku ? 'SKU\'su eksik ürün yok 🎉' : 'Barkodu eksik ürün yok 🎉'}</div>` : html`
      <div class="row wrap"><div class="search" style="flex:1"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün adı, SKU veya barkod" data-bq value="${q}"></div>
        <label class="check"><input type="checkbox" data-all ${v.length && v.every((p) => sel.has(p.id)) ? 'checked' : ''}> Görünenlerin tümünü seç (${n(v.length)})</label></div>
      <div class="table-wrap" style="max-height:50vh;overflow:auto"><table class="t"><tbody>
        ${v.map((p) => html`<tr><td style="width:32px"><input type="checkbox" data-id="${p.id}" ${sel.has(p.id) ? 'checked' : ''}></td><td><div class="row">${thumb(p.image, p.name, 'sm')}<div style="min-width:0"><div class="ellipsis" style="font-weight:600">${label(p)}</div><div class="muted tiny">${isSku ? p.barcode || 'barkod yok' : p.sku || 'SKU yok'}</div></div></div></td>
          ${isSku ? html`<td style="width:190px"><input class="input" data-sku="${p.id}" value="${sku.get(p.id) || ''}" maxlength="40" style="font-family:ui-monospace,monospace;font-size:13px"></td>` : ''}</tr>`)}
      </tbody></table></div>
      ${list.length >= 500 ? html`<div class="muted tiny">İlk 500 ürün listelendi; kalanlar için işlemden sonra pencereyi yeniden açın.</div>` : ''}`}
    </div>`);
    s.setFoot(list.length ? html`<label class="field" style="margin:0;max-width:150px"><span class="tiny">${isSku ? 'SKU ön eki' : 'Barkod ön eki'}</span><input class="input" data-pre ${isSku ? 'maxlength="8" placeholder="ör. HG"' : 'inputmode="numeric" maxlength="9"'} value="${isSku ? prefix : info.prefix}"></label>
      <span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-go ${sel.size ? '' : 'disabled'}><i class="ico ico-tag"></i>${sel.size ? `${n(sel.size)} ürüne ${isSku ? 'SKU' : 'barkod'} oluştur` : 'Ürün seçin'}</button>` : html`<span class="spacer"></span><button class="btn" data-close>Kapat</button>`);
    const bq = $('[data-bq]', s.body);
    if (bq && q) { bq.focus(); bq.setSelectionRange(q.length, q.length); }
  }
  const fail = (e) => toast(e.message, true);
  s.el.addEventListener('input', debounce((e) => {
    if (e.target.matches('[data-bq]')) { q = e.target.value.trim().toLocaleLowerCase('tr'); draw(); }
    // SKU ön eki değişince öneriler yeniden hesaplanır (elle değiştirilenler dahil)
    else if (e.target.matches('[data-pre]') && kind === 'sku') { prefix = e.target.value.trim(); preview().then(draw, fail); }
  }, 350));
  s.el.addEventListener('input', (e) => { if (e.target.matches('[data-sku]')) sku.set(Number(e.target.dataset.sku), e.target.value.trim().toUpperCase()); });
  s.el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-all]')) shown().forEach((p) => (t.checked ? sel.add(p.id) : sel.delete(p.id)));
    else if (t.matches('input[type=checkbox][data-id]')) { const id = Number(t.dataset.id); if (t.checked) sel.add(id); else sel.delete(id); } else return;
    draw();
  });
  s.el.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-kind]');
    if (tab && tab.dataset.kind !== kind) { kind = tab.dataset.kind; load().catch(fail); return; }
    const b = e.target.closest('[data-go]');
    if (!b) return;
    busy(b, async () => {
      const pre = $('[data-pre]', s.el).value;
      const res = kind === 'sku'
        ? await api('products/skus', { method: 'POST', body: { items: [...sel].map((id) => ({ id, sku: sku.get(id) || '' })), prefix: pre } })
        : await api('products/barcodes', { method: 'POST', body: { ids: [...sel], prefix: pre } });
      const rows = kind === 'sku' ? res.assigned.map((x) => ({ name: label(list.find((p) => p.id === x.id) || { name: '' }), code: x.sku })) : res.assigned.map((x) => ({ name: x.name, code: x.barcode }));
      const what = kind === 'sku' ? 'SKU' : 'barkod';
      const csv = `Ürün;${kind === 'sku' ? 'SKU' : 'Barkod'}\n` + rows.map((x) => `${x.name.replace(/;/g, ',')};${x.code}`).join('\n');
      s.setBody(html`<div class="stack"><div class="notice good small"><i class="ico ico-check"></i><div><b>${n(rows.length)} ürüne ${what} oluşturuldu</b>${res.skipped ? ` · ${n(res.skipped)} ürünün ${what}'u zaten vardı, değişmedi` : ''}. Pazaryerine yeni yüklenecek ürünlerde bu ${what} kullanılır.</div></div>
        <div class="table-wrap" style="max-height:55vh;overflow:auto"><table class="t"><thead><tr><th>Ürün</th><th>${kind === 'sku' ? 'SKU' : 'Barkod'}</th></tr></thead><tbody>${rows.map((x) => html`<tr><td>${x.name}</td><td class="num" style="white-space:nowrap">${x.code}</td></tr>`)}</tbody></table></div></div>`);
      s.setFoot(html`<button class="btn" data-copy><i class="ico ico-copy"></i>Listeyi kopyala</button><span class="spacer"></span><button class="btn" data-again>${kind === 'sku' ? 'Barkod' : 'SKU'} sekmesine geç</button><button class="btn primary" data-close>Tamam</button>`);
      $('[data-copy]', s.el).onclick = () => navigator.clipboard.writeText(csv).then(() => toast('Liste kopyalandı (Excel\'e yapıştırılabilir)'), () => toast('Kopyalanamadı', true));
      $('[data-again]', s.el).onclick = () => { kind = kind === 'sku' ? 'barcode' : 'sku'; load().catch(fail); };
      done();
    });
  });
  await load().catch((e) => { s.close(); fail(e); });
}

// Excel ile toplu güncelleme: dosya tarayıcıda okunur, sunucu önizleme döner; onaylanınca uygulanır
function excelDialog(done) {
  let rows = null, file = '';
  const s = sheet({ title: 'Excel\'den toplu güncelle', size: 'wide' });
  const intro = () => {
    s.setBody(html`<div class="stack">
      <ol class="small" style="margin:0;padding-left:20px;line-height:1.8">
        <li><a class="link" href="/api/products.csv">Ürün listesini Excel'e aktarın</a> (her ürün bir satır, ID / SKU / barkod ile).</li>
        <li>Excel'de <b>Alış fiyatı, Satış fiyatı, Stok, Kritik stok, Desi, KDV</b> ya da <b>“Fiyat: Kanal adı”</b> sütunlarını değiştirin. Ürün adı gibi diğer sütunlar değiştirilse de dikkate alınmaz; boş hücre değişiklik sayılmaz.</li>
        <li>Dosyayı (.xlsx ya da .csv) aşağıdan seçin; önce <b>önizleme</b> gösterilir, onaylayınca kaydedilir.</li>
      </ol>
      <label class="btn" style="align-self:flex-start"><i class="ico ico-upload"></i>Dosya seç (.xlsx / .csv)<input type="file" accept=".xlsx,.csv,.txt" data-file hidden></label>
      <div class="muted tiny">Stok senkronu kapalıyken stoğu ikas'tan okunan ürünlerin stoğu değiştirilmez. Kanal fiyatları kaydedilince kanala gönderilir.</div>
    </div>`);
    s.setFoot(html`<span class="spacer"></span><button class="btn" data-close>Kapat</button>`);
  };
  const fmt = (v) => (v == null ? '—' : String(Math.round(v * 100) / 100).replace('.', ','));
  function preview(r) {
    s.setBody(html`<div class="stack">
      <div class="notice ${r.changes ? '' : 'warn'} small"><i class="ico ico-${r.changes ? 'check' : 'warn'}"></i><div><b>${file}</b> · ${n(r.rows)} satır, ${n(r.matched)} ürün eşleşti · <b>${n(r.changes)} değişiklik</b>${Object.keys(r.counts).length ? ` (${Object.entries(r.counts).map(([k, x]) => `${k} ${x}`).join(', ')})` : ''}<div class="tiny muted">Okunan sütunlar: ${r.columns.join(', ')}</div></div></div>
      ${r.preview.length ? html`<div class="table-wrap" style="max-height:42vh;overflow:auto"><table class="t"><thead><tr><th>Ürün</th><th>Alan</th><th class="r">Eski</th><th class="r">Yeni</th></tr></thead><tbody>
        ${r.preview.map((c) => html`<tr><td class="ellipsis" style="max-width:320px">${c.name}</td><td class="small">${c.label}</td><td class="r num muted">${fmt(c.old)}</td><td class="r num" style="font-weight:650">${fmt(c.new)}</td></tr>`)}
      </tbody></table></div>${r.changes > r.preview.length ? html`<div class="muted tiny">İlk ${r.preview.length} değişiklik gösteriliyor; tümü uygulanır.</div>` : ''}` : ''}
      ${r.skippedTotal ? html`<details${r.changes ? '' : ' open'}><summary class="small" style="cursor:pointer;color:var(--warn)">${n(r.skippedTotal)} satır / hücre atlandı</summary><ul class="small" style="margin:6px 0 0;padding-left:20px">${r.skipped.map((x) => html`<li>${x.line}. satır: ${x.reason}</li>`)}</ul></details>` : ''}
    </div>`);
    s.setFoot(html`<button class="btn" data-again>Başka dosya</button><span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-apply ${r.changes ? '' : 'disabled'}><i class="ico ico-check"></i>${n(r.changes)} değişikliği kaydet</button>`);
  }
  intro();
  s.el.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-file]')) return;
    const f = e.target.files[0]; if (!f) return;
    file = f.name;
    s.setBody(html`<div class="empty"><i class="ico ico-sync spin"></i> ${f.name} okunuyor…</div>`);
    try {
      rows = await readSheet(f);
      if (!rows.length) throw new Error('Dosyada satır bulunamadı');
      preview(await api('products/bulk', { method: 'POST', body: { rows, dry: true } }));
    } catch (err) { toast(err.message, true); intro(); }
  });
  s.el.addEventListener('click', (e) => {
    if (e.target.closest('[data-again]')) { rows = null; intro(); return; }
    const b = e.target.closest('[data-apply]');
    if (!b || !rows) return;
    busy(b, async () => {
      const r = await api('products/bulk', { method: 'POST', body: { rows, dry: false } });
      toast(`${n(r.changes)} değişiklik kaydedildi${r.prices ? ' · kanal fiyatları gönderiliyor' : ''}${r.stock ? ' · stoklar kanallara gönderiliyor' : ''}`);
      s.close(); done();
    });
  });
}

// ---------- varyant grubu: tüm varyantlar tek ekranda ----------
// Ad, SKU, barkod, alış / satış fiyatı, stok, kritik stok, aktiflik ve her kanaldaki fiyat aynı tablodan değiştirilir.
// "Toplu değiştir": seçili (seçim yoksa tüm) varyantlara değer / yüzde / tutar uygular; kanal fiyatını satış fiyatı + % olarak da kurar.
// Yalnız değişen hücreler kaydedilir; kanal fiyatları tek seferde kanallara gönderilir.
export async function variantEditor(ids, done, title = '') {
  const s = sheet({ title: title ? `${title} · varyantlar` : 'Varyantlar', size: 'wide xwide' });
  s.setBody(html`<div class="empty"><i class="ico ico-sync spin"></i></div>`);
  let list;
  try { list = (await api('products-variants?ids=' + ids.join(','), { fresh: true })).products; } catch (e) { return s.setBody(html`<div class="notice bad">${e.message}</div>`); }
  if (!list.length) return s.setBody(html`<div class="empty">Ürün bulunamadı</div>`);
  const chans = [...new Set(list.flatMap((p) => p.listings.map((l) => l.channel)))].sort((a, b) => activeChannels().findIndex((c) => c.id === a) - activeChannels().findIndex((c) => c.id === b));
  const p0 = list[0], group0 = p0.group_name || p0.name, brand0 = list.find((p) => p.brand)?.brand || '';
  const lst = (p, c) => p.listings.find((l) => l.channel === c);
  const num = (v) => (v == null || v === '' ? '' : String(Math.round(Number(v) * 100) / 100).replace('.', ','));
  const TARGETS = [['sale_price', 'Satış fiyatı'], ['purchase_price', 'Alış fiyatı'], ...chans.map((c) => ['ch:' + c, `Fiyat: ${ch(c).name}`]), ['stock', 'Stok'], ['critical_stock', 'Kritik stok']];
  const inp = (i, k, v, extra = '') => html`<input class="input vin num" inputmode="decimal" data-r="${i}" data-k="${k}" value="${v}" data-o="${v}" ${raw(extra)}>`;
  s.setBody(html`<div class="stack">
    <div class="card"><div class="form-grid">
      <label class="field"><span>Ana ürün adı (tüm varyantlar)</span><input class="input" data-shared="group_name" value="${group0}" data-o="${group0}"></label>
      <label class="field"><span>Marka</span><input class="input" data-shared="brand" value="${brand0}" data-o="${brand0}"></label>
    </div></div>
    <div class="card vapply">
      <b class="small">Toplu değiştir</b>
      <select class="input" data-t>${TARGETS.map(([k, t]) => html`<option value="${k}">${t}</option>`)}</select>
      <select class="input" data-op>
        <option value="set">değer yap</option><option value="pct">% artır (− ile azalt)</option><option value="add">₺ ekle (− ile düş)</option><option value="fromsale">satış fiyatı + %</option>
      </select>
      <input class="input num" data-v inputmode="decimal" placeholder="ör. 249,90 ya da 10">
      <button class="btn" data-x="apply"><i class="ico ico-check"></i>Uygula</button>
      <span class="muted tiny" data-scope>Tüm varyantlara uygulanır</span>
    </div>
    <div class="card flush"><div class="table-wrap"><table class="t vt"><thead><tr>
      <th class="cbcol"><input type="checkbox" class="cb" data-all aria-label="Tümünü seç"></th><th class="stick">Varyant</th><th class="r">Alış ₺</th><th class="r">Satış ₺</th>
      ${chans.map((c) => html`<th class="r"><span class="row" style="justify-content:flex-end;gap:5px" title="${ch(c).name} fiyatı">${chLogo(c, true)}${ch(c).short || ch(c).name} ₺</span></th>`)}<th class="r">Stok</th><th class="r">Kritik</th><th>SKU</th><th>Barkod</th><th class="c">Aktif</th></tr></thead><tbody>
      ${list.map((p, i) => html`<tr data-i="${i}">
        <td class="cbcol"><input type="checkbox" class="cb" data-sel="${i}"></td>
        <td class="stick"><div class="row" style="gap:8px;min-width:200px">${thumb(p.image, p.variant_name || p.name, 'sm')}<input class="input vin" data-r="${i}" data-k="variant_name" value="${p.variant_name || ''}" data-o="${p.variant_name || ''}" placeholder="${p.name}"></div></td>
        <td>${inp(i, 'purchase_price', num(p.purchase_price))}</td>
        <td>${inp(i, 'sale_price', num(p.sale_price), p.currency && p.fx_price ? `title="Döviz fiyatlı (${p.fx_price} ${p.currency}); kur güncellemesi bunu değiştirir"` : '')}</td>
        ${chans.map((c) => { const l = lst(p, c); return html`<td class="chp">${l ? inp(i, 'ch:' + c, num(l.price), l.error ? `title="${l.error}"` : '') : html`<span class="muted tiny" title="Bu varyantın bu kanalda ilanı yok">—</span>`}</td>`; })}
        <td>${p.site_stock ? html`<span class="ro" title="ikas sitesinden okunur (stok senkronu kapalı)">${p.stock} <span class="muted tiny">ikas</span></span>` : inp(i, 'stock', String(p.stock))}</td>
        <td>${inp(i, 'critical_stock', String(p.critical_stock || 0))}</td>
        <td><input class="input vin code" data-r="${i}" data-k="sku" value="${p.sku || ''}" data-o="${p.sku || ''}"></td>
        <td><input class="input vin code" data-r="${i}" data-k="barcode" value="${p.barcode || ''}" data-o="${p.barcode || ''}"></td>
        <td class="c"><input type="checkbox" class="cb" data-r="${i}" data-k="active" ${p.active ? 'checked' : ''} data-o="${p.active ? '1' : '0'}"></td></tr>`)}
    </tbody></table></div></div>
    <div class="muted tiny">Fiyatlar kaydedilince kanallara gönderilir (pazaryerine bir fiyat, kendi sitenize başka fiyat verebilirsiniz). Stok değişikliği stok hareketi olarak kaydedilir.${list.some((p) => p.site_stock) ? ' “ikas” yazan stoklar ikas sitesinden okunur; adet ikas panelinden değişir.' : ''}</div>
  </div>`);
  s.setFoot(html`<span class="muted small" data-cnt>Değişiklik yok</span><span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save disabled>Kaydet</button>`);
  const parse = (v) => numIn(v);
  const changed = () => $$('[data-o]', s.body).filter((x) => (x.type === 'checkbox' ? (x.checked ? '1' : '0') : x.value.trim()) !== x.dataset.o);
  const mark = () => {
    $$('[data-o]', s.body).forEach((x) => x.classList.toggle('chg', (x.type === 'checkbox' ? (x.checked ? '1' : '0') : x.value.trim()) !== x.dataset.o));
    const n2 = changed().length;
    $('[data-cnt]', s.el).textContent = n2 ? `${n2} değişiklik` : 'Değişiklik yok';
    $('[data-save]', s.el).disabled = !n2;
  };
  const selRows = () => $$('[data-sel]:checked', s.body).map((x) => Number(x.dataset.sel));
  const scope = () => { const k = selRows().length; $('[data-scope]', s.body).textContent = k ? `Seçili ${k} varyanta uygulanır` : 'Tüm varyantlara uygulanır'; };
  s.body.addEventListener('input', mark);
  s.body.addEventListener('change', (e) => {
    if (e.target.matches('[data-all]')) $$('[data-sel]', s.body).forEach((x) => { x.checked = e.target.checked; });
    if (e.target.matches('[data-sel], [data-all]')) scope();
    mark();
  });
  s.body.addEventListener('click', (e) => {
    if (!e.target.closest('[data-x=apply]')) return;
    const t = $('[data-t]', s.body).value, op = $('[data-op]', s.body).value, raw0 = $('[data-v]', s.body).value.trim();
    if (raw0 === '') return toast('Değer girin', true);
    const v = parse(raw0), rowsIdx = selRows().length ? selRows() : list.map((_, i) => i);
    let n2 = 0;
    for (const i of rowsIdx) {
      const el2 = $(`[data-r="${i}"][data-k="${t}"]`, s.body);
      if (!el2) continue;
      const cur = parse(el2.value), sale = parse(($(`[data-r="${i}"][data-k="sale_price"]`, s.body) || {}).value);
      let nv = op === 'set' ? v : op === 'pct' ? cur * (1 + v / 100) : op === 'add' ? cur + v : sale * (1 + v / 100);
      nv = ['stock', 'critical_stock'].includes(t) ? Math.max(0, Math.round(nv)) : Math.max(0, Math.round(nv * 100) / 100);
      el2.value = num(nv); n2++;
    }
    mark();
    toast(n2 ? `${n2} hücre güncellendi — kaydetmeyi unutmayın` : 'Uygulanacak hücre yok (bu kanalda ilanı olmayan varyantlar atlanır)', !n2);
  });
  $('[data-save]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
    const items = new Map(), shared = {};
    for (const x of changed()) {
      if (x.dataset.shared) { shared[x.dataset.shared] = x.value.trim(); continue; }
      const i = Number(x.dataset.r), p = list[i], k = x.dataset.k;
      const it = items.get(i) || items.set(i, { id: p.id }).get(i);
      if (k.startsWith('ch:')) { const l = lst(p, k.slice(3)); (it.listings = it.listings || []).push({ channel: l.channel, remote_id: l.remote_id, price: parse(x.value) }); }
      else if (k === 'active') it.active = x.checked ? 1 : 0;
      else if (['variant_name', 'sku', 'barcode'].includes(k)) it[k] = x.value.trim();
      else if (k === 'stock' || k === 'critical_stock') it[k] = Math.round(parse(x.value));
      else it[k] = parse(x.value);
    }
    // Ortak alan değişti ama satır değişmediyse: gruptaki tüm varyantlara yazılsın diye her varyant gönderilir
    if (Object.keys(shared).length) list.forEach((p, i) => { if (!items.has(i)) items.set(i, { id: p.id }); });
    const r = await api('products-variants', { method: 'POST', body: { items: [...items.values()], shared } });
    if (r.errors && r.errors.length) toast(`${r.saved} varyant kaydedildi · ${r.errors.length} hata: ${r.errors.map((x) => `${(list.find((p) => p.id === x.id) || {}).variant_name || x.id}: ${x.error}`).join(' | ')}`, true);
    else toast(`${r.saved} varyant kaydedildi${[...items.values()].some((x) => x.listings) ? ' · kanal fiyatları gönderiliyor' : ''}`);
    s.close(); done && done();
  });
}
