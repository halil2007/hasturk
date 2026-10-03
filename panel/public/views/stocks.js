// Stoklar: ortak stok, stok durumu bölümleri (stokta yok / sınır altı / yeterli) ve kanala özel stok kuralları.
// Kural: Ortak (ortak stok olduğu gibi), En fazla N (ortak stok ama bu kanala en çok N), Ayrılmış N (bu kanalda sabit N adet;
// o kanaldaki satış hem bu adetten hem depo stoğundan düşer). Satış olunca stok düşer ve her kanala kendi kuralına göre gönderilir.
import { api, state, html, render, $, $$, n, ch, chLogo, thumb, isMobile, actions, busy, toast, debounce, sheet, numIn, activeChannels } from '../core.js';
import { stockDialog, quickStock, siteStock, siteStockVal } from './products.js';
import { setQuery } from '../app.js';

const STATUS = [['out', 'Stokta yok', 'bad'], ['below', 'Sınır altı', 'amber'], ['enough', 'Yeterli', 'good'], ['', 'Tümü', '']];
const EXTRA = [['', 'Hepsi'], ['waiting', 'Gönderim bekleyen'], ['error', 'Hatalı'], ['nolisting', 'Kanalda olmayan']];
export const RULE = { shared: 'Ortak stok', limit: 'En fazla', own: 'Ayrılmış' };
export const ruleText = (l) => (l.stock_mode === 'limit' ? `en fazla ${l.stock_value ?? 0}` : l.stock_mode === 'own' ? `ayrılmış ${l.stock_value ?? 0}` : '');

export async function stocks(el, rest, query = {}) {
  const f = { q: query.q || '', status: query.durum ?? (rest[0] === 'kritik' ? 'below' : ''), extra: query.f || '', page: 1 };
  let rows = [], total = 0, counts = {}, dash = null;
  render(el, html`<div class="stack">
    <div class="kpis" data-kpis></div>
    <div data-sync></div>
    <div class="tabs" data-status></div>
    <div class="row wrap">
      <div class="search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün adı, SKU veya barkod" data-q value="${f.q}"></div>
      <select class="input" style="width:auto" data-extra>${EXTRA.map(([k, t]) => html`<option value="${k}" ${f.extra === k ? 'selected' : ''}>${t}</option>`)}</select>
      <span class="spacer"></span>
      <button class="btn" data-act="push"><i class="ico ico-upload"></i>Stokları şimdi gönder</button>
    </div>
    <div class="card flush" data-box></div>
  </div>`);

  const low = () => (state.settings && state.settings.low_stock) ?? 5;
  const chs = () => activeChannels().filter((c) => c.enabled || c.demo);
  function cell(p, c) {
    const l = (p.listings || []).find((x) => x.channel === c.id);
    if (!l) return html`<span class="muted">—</span>`;
    const want = l.desired ?? Math.max(0, p.stock), shown = l.pushed_stock ?? l.remote_stock;
    const rule = l.stock_mode && l.stock_mode !== 'shared' ? html`<div class="tiny muted">${ruleText(l)}</div>` : '';
    const pill = l.error ? html`<span class="pill bad" title="${l.error}"><i class="ico ico-warn"></i>${shown ?? '?'}</span>`
      : state.settings && state.settings.stock_sync && shown !== want ? html`<span class="pill amber" title="Gönderim bekliyor">${shown ?? '?'} → ${want}</span>`
        : state.settings && !state.settings.stock_sync ? html`<span class="pill ${(shown ?? 0) <= 0 ? 'bad' : 'good'}" title="Kanaldaki stok (gönderim kapalı)${shown !== want ? ` · senkron açılınca ${want} olur` : ''}">${shown ?? '?'}</span>`
        : html`<span class="pill ${want <= 0 ? 'bad' : 'good'}" title="Kanaldaki stok">${want}</span>`;
    return html`<button class="plain" data-act="rule" data-id="${p.id}" title="Kanal stok kuralı">${pill}${rule}</button>`;
  }
  const stockCtl = (p) => siteStock(p) ? siteStockVal(p, p.stock <= 0 ? 'neg' : p.stock <= (p.low_limit ?? low()) ? 'low' : '') : html`<div class="stock-ctl"><button class="round" data-act="dec" data-id="${p.id}" aria-label="Stok azalt"><i class="ico ico-minus"></i></button>
    <span class="val num ${p.stock <= 0 ? 'neg' : p.stock <= (p.low_limit ?? low()) ? 'low' : ''}" data-act="stock" data-id="${p.id}" title="Stok girişi / sayım">${p.stock}</span>
    <button class="round" data-act="inc" data-id="${p.id}" aria-label="Stok artır"><i class="ico ico-plus"></i></button></div>`;
  const pname = (p) => html`<div class="ellipsis" style="max-width:320px;font-weight:650">${p.group_name || p.name}${p.variant_name ? html`<span class="var-tag">${p.variant_name}</span>` : ''}</div>`;

  function draw() {
    render($('[data-kpis]', el), html`
      <a class="kpi" href="#/stoklar?durum=out"><div class="label">Stokta yok</div><div class="value num ${counts.out ? 'down' : ''}">${n(counts.out)}</div><div class="delta flat">ürün</div></a>
      <a class="kpi" href="#/stoklar?durum=below"><div class="label">Sınırın altında</div><div class="value num">${n(counts.below)}</div><div class="delta flat">sınır: ${low()} adet ve altı</div></a>
      <a class="kpi" href="#/stoklar?durum=enough"><div class="label">Yeterli stok</div><div class="value num">${n(counts.enough)}</div><div class="delta flat">ürün</div></a>
      <a class="kpi" href="#/stoklar?f=waiting"><div class="label">${dash && !dash.stockSync ? 'Stoğu farklı ilan' : 'Gönderim bekleyen'}</div><div class="value num">${n(dash ? dash.stock.waiting : 0)}</div><div class="delta flat">${dash && !dash.stockSync ? 'senkron açılınca güncellenir' : 'kanal ilanı'}</div></a>`);
    render($('[data-sync]', el), dash && dash.stockSync ? ''
      : html`<div class="notice warn"><i class="ico ico-warn"></i><div style="flex:1"><b>Stok gönderimi kapalı.</b> Hiçbir kanala stok gönderilmez; panel stokları ikas sitesindeki (ana katalog) adetlerden okunur. Sistem hazır olunca Ayarlar → Stok'tan açın; açılınca stok panelde tutulur, satışla düşer ve tüm kanallara gönderilir.</div><a class="btn sm" href="#/ayarlar">Ayarlar</a></div>`);
    render($('[data-status]', el), html`${STATUS.map(([k, t, c]) => html`<button class="tab ${f.status === k ? 'on' : ''}" data-act="status" data-k="${k}">${c ? html`<span class="dot" style="background:var(--${c})"></span>` : ''}${t}<span class="n">${n(k ? counts[k] : counts.all)}</span></button>`)}`);
    const body = !rows.length ? html`<div class="empty">Bu bölümde ürün yok</div>`
      : isMobile() ? html`<div class="m-list" style="padding:12px">${rows.map((p) => html`<div class="m-card" data-pid="${p.id}"><div class="top">${thumb(p.image, p.name, 'sm')}<div style="min-width:0;flex:1">${pname(p)}<div class="muted tiny">${p.sku || ''}</div></div>${stockCtl(p)}</div>
          <div class="row wrap">${chs().map((c) => html`<span class="row tiny">${chLogo(c.id, true)}${cell(p, c)}</span>`)}</div></div>`)}</div>`
        : html`<div class="table-wrap"><table class="t"><thead><tr><th>Ürün</th><th class="c">Ortak stok</th>${chs().map((c) => html`<th class="c"><span class="row" style="justify-content:center">${chLogo(c.id, true)}${c.short || c.name}</span></th>`)}<th></th></tr></thead><tbody>
          ${rows.map((p) => html`<tr data-pid="${p.id}"><td><div class="row">${thumb(p.image, p.name, 'sm')}<div style="min-width:0">${pname(p)}<div class="muted tiny">${[p.sku, p.barcode].filter(Boolean).join(' · ')}</div></div></div></td>
            <td class="c">${stockCtl(p)}</td>${chs().map((c) => html`<td class="c">${cell(p, c)}</td>`)}<td class="r">${(p.listings || []).length ? html`<button class="btn sm ghost" data-act="rule" data-id="${p.id}">Kanal stokları</button>` : ''}</td></tr>`)}
        </tbody></table></div>`;
    render($('[data-box]', el), html`${body}<div class="pager"><span class="muted small" style="margin-right:auto">${total} ürün</span>${rows.length < total ? html`<button class="btn sm" data-act="more">Daha fazla</button>` : ''}</div>`);
  }
  async function load(append = false) {
    setQuery({ durum: f.status, f: f.extra, q: f.q });
    const p = new URLSearchParams({ page: f.page, limit: 50, sort: 'stock' });
    if (f.q) p.set('q', f.q);
    if (f.extra) p.set('filter', f.extra); else if (f.status) p.set('filter', f.status);
    const [r, d] = await Promise.all([api('products?' + p), dash && append ? dash : api('dashboard')]);
    rows = append ? rows.concat(r.products) : r.products; total = r.total; counts = r.counts || {}; dash = d;
    if (f.extra && f.status) rows = rows.filter((x) => (f.status === 'out' ? x.stock <= 0 : f.status === 'below' ? x.stock > 0 && x.stock <= x.low_limit : x.stock > x.low_limit));
    draw();
  }
  const refresh = () => { f.page = 1; return load().catch((e) => toast(e.message, true)); };
  const bump = quickStock(() => rows, el);
  actions(el, {
    status: (t) => { f.status = t.dataset.k; refresh(); },
    more: () => { f.page++; load(true); },
    inc: (t) => bump(t.dataset.id, 1),
    dec: (t) => bump(t.dataset.id, -1),
    stock: (t) => stockDialog(rows.find((x) => x.id === Number(t.dataset.id)), refresh),
    rule: (t) => ruleDialog(rows.find((x) => x.id === Number(t.dataset.id)), refresh),
    push: (t) => busy(t, async () => { const r = await api('push-stock', { method: 'POST' }); toast(r.skipped || Object.entries(r).map(([k, v]) => `${ch(k).name}: ${v}`).join(' · ') || 'Gönderilecek değişiklik yok'); refresh(); }),
  });
  $('[data-extra]', el).addEventListener('change', (e) => { f.extra = e.target.value; refresh(); });
  $('[data-q]', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); refresh(); }, 300));
  await refresh();
  return { refresh };
}

// Ürünün her kanaldaki stok kuralı
export function ruleDialog(p, done) {
  if (!p || !(p.listings || []).length) return toast('Bu ürün henüz bir kanal ilanına bağlı değil');
  const calc = (mode, v) => Math.max(0, mode === 'own' ? v : mode === 'limit' ? Math.min(p.stock, v) : p.stock);
  const s = sheet({
    title: `${p.name} · kanal stokları`,
    body: html`<div class="stack">
      <div class="row"><span class="muted">Ortak stok</span><span class="spacer"></span><b class="num" style="font-size:22px">${p.stock}</b></div>
      ${p.listings.map((l, i) => html`<div class="cand" style="flex-wrap:wrap" data-i="${i}">
        <span class="ch-name" style="min-width:140px">${chLogo(l.channel, true)}${ch(l.channel).name}</span>
        <select class="input rule-sel" data-mode>${Object.entries(RULE).map(([k, t]) => html`<option value="${k}" ${(l.stock_mode || 'shared') === k ? 'selected' : ''}>${t}</option>`)}</select>
        <input class="input rule-sel num" style="width:80px" type="number" min="0" inputmode="numeric" data-val value="${l.stock_value ?? ''}" placeholder="adet" ${(l.stock_mode || 'shared') === 'shared' ? 'hidden' : ''}>
        <span class="spacer"></span><span class="small">Kanala gidecek: <b class="num" data-out>${l.desired ?? calc(l.stock_mode, l.stock_value || 0)}</b></span>
      </div>`)}
      <div class="muted small"><b>Ortak stok:</b> ürünün tüm stoğu bu kanalda satışa açık. <b>En fazla:</b> ortak stok kullanılır ama bu kanalda en çok girilen adet görünür. <b>Ayrılmış:</b> ortak stoktan bağımsız olarak bu kanalda sabit adet gösterilir (ör. Trendyol'da 10, Hepsiburada'da 5); bu kanaldaki her satış hem ayrılan adetten hem ortak (depo) stoktan düşer.</div>
    </div>`,
    foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>Kaydet ve gönder</button>`,
  });
  const upd = (row) => {
    const mode = $('[data-mode]', row).value, inp = $('[data-val]', row);
    inp.hidden = mode === 'shared';
    $('[data-out]', row).textContent = calc(mode, numIn(inp.value));
  };
  s.body.addEventListener('input', (e) => { const r = e.target.closest('[data-i]'); if (r) upd(r); });
  s.body.addEventListener('change', (e) => { const r = e.target.closest('[data-i]'); if (r) upd(r); });
  $('[data-save]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
    for (const row of $$('[data-i]', s.body)) {
      const l = p.listings[Number(row.dataset.i)], mode = $('[data-mode]', row).value, value = numIn($('[data-val]', row).value);
      if (mode === (l.stock_mode || 'shared') && (mode === 'shared' || value === (l.stock_value ?? 0))) continue;
      await api('listings/stock', { method: 'POST', body: { channel: l.channel, remote_id: l.remote_id, mode, value } });
    }
    s.close(); toast('Kanal stok kuralları kaydedildi'); done && done();
  });
}
