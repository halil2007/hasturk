// Stoklar: ortak (merkezi) stok ve her kanaldaki stok durumu. Bir kanalda satış olunca ortak stok düşer ve
// tüm kanallara gönderilir; buradan yapılan giriş/sayım da anında tüm kanallara gider.
import { api, state, html, render, $, n, ch, chLogo, thumb, isMobile, actions, busy, toast, debounce } from '../core.js';
import { stockDialog, quickStock } from './products.js';

const FILTERS = [['', 'Tümü'], ['low', 'Kritik stok'], ['waiting', 'Gönderim bekleyen'], ['error', 'Hatalı'], ['nolisting', 'Kanalda olmayan']];

export async function stocks(el, rest) {
  const f = { q: '', filter: rest[0] === 'kritik' ? 'low' : '', page: 1 };
  let rows = [], total = 0, dash = null;
  render(el, html`<div class="stack">
    <div class="kpis" data-kpis></div>
    <div data-sync></div>
    <div class="row wrap">
      <div class="search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün adı, SKU veya barkod" data-q></div>
      <button class="btn" data-act="push"><i class="ico ico-upload"></i>Stokları şimdi gönder</button>
    </div>
    <div class="tabs" data-filters></div>
    <div class="card flush" data-box></div>
  </div>`);

  const chs = () => state.channels.filter((c) => c.enabled || c.demo);
  function cell(p, c) {
    const l = (p.listings || []).find((x) => x.channel === c.id);
    if (!l) return html`<span class="muted">—</span>`;
    const want = Math.max(0, p.stock), shown = l.pushed_stock ?? l.remote_stock;
    if (l.error) return html`<span class="pill bad" title="${l.error}"><i class="ico ico-warn"></i>${shown ?? '?'}</span>`;
    if (state.settings && state.settings.stock_sync && shown !== want) return html`<span class="pill amber" title="Gönderim bekliyor">${shown ?? '?'} → ${want}</span>`;
    return html`<span class="pill good" title="Güncel">${shown ?? '—'}</span>`;
  }
  const stockCtl = (p) => html`<div class="stock-ctl"><button class="round" data-act="dec" data-id="${p.id}" aria-label="Stok azalt"><i class="ico ico-minus"></i></button>
    <span class="val num ${p.stock <= 0 ? 'neg' : p.stock <= p.critical_stock ? 'low' : ''}" data-act="stock" data-id="${p.id}" title="Stok girişi / sayım">${p.stock}</span>
    <button class="round" data-act="inc" data-id="${p.id}" aria-label="Stok artır"><i class="ico ico-plus"></i></button></div>`;
  function draw() {
    const s = dash.stock;
    render($('[data-kpis]', el), html`
      <div class="kpi"><div class="label">Ürün</div><div class="value num">${n(s.products)}</div><div class="delta flat">${n(s.units)} adet toplam</div></div>
      <a class="kpi" href="#/stoklar/kritik"><div class="label">Kritik stok</div><div class="value num ${dash.lowStock.length ? 'down' : ''}">${dash.lowStock.length}</div><div class="delta flat">uyarı seviyesinde</div></a>
      <div class="kpi"><div class="label">Gönderim bekleyen</div><div class="value num">${s.waiting}</div><div class="delta flat">ilan</div></div>
      <div class="kpi"><div class="label">Eşleşmemiş ilan</div><div class="value num ${s.unlinked ? 'down' : ''}">${s.unlinked}</div><div class="delta flat"><a class="link" href="#/urunler/eslestir">eşleştir</a></div></div>`);
    render($('[data-sync]', el), dash.stockSync
      ? html`<div class="notice good"><i class="ico ico-check"></i><div style="flex:1"><b>Stok senkronu açık.</b> Satışlar ortak stoktan düşer, değişen stok tüm kanallara gönderilir.</div><a class="btn sm" href="#/ayarlar">Ayarlar</a></div>`
      : html`<div class="notice warn"><i class="ico ico-warn"></i><div style="flex:1"><b>Stok senkronu kapalı.</b> Ürün eşleştirmelerini ve adetleri kontrol ettikten sonra açın.</div><a class="btn sm primary" href="#/ayarlar">Aç</a></div>`);
    const mob = isMobile();
    const body = !rows.length ? html`<div class="empty">Bu filtrede ürün yok</div>`
      : mob ? html`<div class="m-list" style="padding:12px">${rows.map((p) => html`<div class="m-card" data-pid="${p.id}"><div class="top">${thumb(p.image, p.name, 'sm')}<div style="min-width:0;flex:1"><div class="ellipsis" style="font-weight:650">${p.name}</div><div class="muted tiny">${p.sku || ''}</div></div>${stockCtl(p)}</div>
          <div class="row wrap">${chs().map((c) => html`<span class="row tiny">${chLogo(c.id, true)}${cell(p, c)}</span>`)}</div></div>`)}</div>`
        : html`<div class="table-wrap"><table class="t"><thead><tr><th>Ürün</th><th class="c">Ortak stok</th>${chs().map((c) => html`<th class="c"><span class="row" style="justify-content:center">${chLogo(c.id, true)}${c.short || c.name}</span></th>`)}<th class="c">Kritik</th></tr></thead><tbody>
          ${rows.map((p) => html`<tr data-pid="${p.id}"><td><div class="row">${thumb(p.image, p.name, 'sm')}<div style="min-width:0"><div class="ellipsis" style="max-width:300px;font-weight:650">${p.name}</div><div class="muted tiny">${[p.sku, p.barcode].filter(Boolean).join(' · ')}</div></div></div></td>
            <td class="c">${stockCtl(p)}</td>${chs().map((c) => html`<td class="c">${cell(p, c)}</td>`)}<td class="c num muted">${p.critical_stock || '—'}</td></tr>`)}
        </tbody></table></div>`;
    render($('[data-box]', el), html`${body}<div class="pager"><span class="muted small" style="margin-right:auto">${total} ürün</span>${rows.length < total ? html`<button class="btn sm" data-act="more">Daha fazla</button>` : ''}</div>`);
  }
  async function load(append = false) {
    const p = new URLSearchParams({ page: f.page, limit: 50, sort: 'stock' });
    if (f.q) p.set('q', f.q);
    if (f.filter) p.set('filter', f.filter);
    const [r, d] = await Promise.all([api('products?' + p), dash && append ? dash : api('dashboard')]);
    rows = append ? rows.concat(r.products) : r.products; total = r.total; dash = d;
    render($('[data-filters]', el), html`${FILTERS.map(([k, t]) => html`<button class="tab ${f.filter === k ? 'on' : ''}" data-act="filter" data-k="${k}">${t}</button>`)}`);
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
    push: (t) => busy(t, async () => { const r = await api('push-stock', { method: 'POST' }); toast(r.skipped || Object.entries(r).map(([k, v]) => `${ch(k).name}: ${v}`).join(' · ') || 'Gönderilecek değişiklik yok'); refresh(); }),
  });
  $('[data-q]', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); refresh(); }, 300));
  await refresh();
  return { refresh };
}
