// Stoklar: ortak stok, stok durumu bölümleri (stokta yok / sınır altı / yeterli) ve kanala özel stok kuralları.
// Kural: Ortak (ortak stok olduğu gibi), En fazla N (ortak stok ama bu kanala en çok N), Ayrılmış N (bu kanalda sabit N adet;
// o kanaldaki satış hem bu adetten hem depo stoğundan düşer). Satış olunca stok düşer ve her kanala kendi kuralına göre gönderilir.
import { api, state, html, render, $, $$, n, ch, chLogo, thumb, isMobile, actions, busy, toast, debounce, sheet, numIn, activeChannels, popMenu } from '../core.js';
import { stockDialog, quickStock, siteStock, productForm } from './products.js';
import { setQuery } from '../app.js';

const STATUS = [['', 'Tüm ürünler', 'all', 'box', 'blue'], ['out', 'Stokta yok', 'out', 'x', 'red'], ['runout', 'Tükenmek üzere', 'runout', 'warn', 'red'], ['below', 'Kritik seviyede', 'below', 'db', 'amber'], ['enough', 'Yeterli', 'enough', 'check', 'green']];
const EXTRA = [['', 'Tüm kanal durumları'], ['waiting', 'Kanala gönderim bekleyen'], ['error', 'Kanal hatası olan'], ['nolisting', 'Hiçbir kanalda olmayan']];
const SORTS = [['sold', 'En çok satan (30 gün)'], ['days', 'En erken tükenecek'], ['stock', 'Stok (azdan çoğa)'], ['stock_desc', 'Stok (çoktan aza)'], ['name', 'Ada göre (A–Z)']];
export const RULE = { shared: 'Ortak stok', limit: 'En fazla', own: 'Ayrılmış' };
export const ruleText = (l) => (l.stock_mode === 'limit' ? `en fazla ${l.stock_value ?? 0}` : l.stock_mode === 'own' ? `ayrılmış ${l.stock_value ?? 0}` : '');

export async function stocks(el, rest, query = {}) {
  const f = { q: query.q || '', status: query.durum ?? (rest[0] === 'kritik' ? 'below' : ''), extra: query.f || '', sort: query.sort || 'sold', page: 1 };
  let rows = [], total = 0, counts = {}, dash = null;
  render(el, html`<div class="stack">
    <div class="sstats" data-kpis></div>
    <div data-sync></div>
    <div class="card toolbar-card">
      <div class="row wrap page-actions">
        <div class="search grow"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün adı, SKU veya barkod ara" data-q value="${f.q}"></div>
        <label class="sort-pick"><i class="ico ico-link"></i><select data-extra aria-label="Kanal durumu">${EXTRA.map(([k, t]) => html`<option value="${k}" ${f.extra === k ? 'selected' : ''}>${t}</option>`)}</select></label>
        <label class="sort-pick"><i class="ico ico-bars"></i><select data-sort aria-label="Sırala">${SORTS.map(([k, t]) => html`<option value="${k}" ${f.sort === k ? 'selected' : ''}>${t}</option>`)}</select></label>
        <button class="btn" data-act="push" data-push><i class="ico ico-upload"></i>Stokları şimdi gönder</button>
      </div>
    </div>
    <div class="card flush" data-box></div>
  </div>`);

  const low = () => (state.settings && state.settings.low_stock) ?? 5;
  const chs = () => activeChannels().filter((c) => c.enabled || c.demo);
  const syncOn = () => !!(state.settings && state.settings.stock_sync);
  const pushOn = (id) => syncOn() || !!((state.settings && state.settings.stock_push) || {})[id];
  const cls = (p) => (p.stock <= 0 ? 'neg' : p.stock <= (p.low_limit ?? low()) ? 'low' : '');
  // Kanal hücresi: kanaldaki adet. Panel stoğuyla aynıysa sade, gönderim bekliyorsa turuncu (eski → yeni), hata kırmızı
  function cell(p, c) {
    const l = (p.listings || []).find((x) => x.channel === c.id);
    if (!l) return html`<span class="chc none" title="Bu kanalda ilanı yok">—</span>`;
    const want = l.desired ?? Math.max(0, p.stock), shown = l.pushed_stock ?? l.remote_stock;
    const rule = l.stock_mode && l.stock_mode !== 'shared' ? html`<span class="rule" title="Kanal stok kuralı">${ruleText(l)}</span>` : '';
    if (l.error) return html`<button class="chc err" data-act="rule" data-id="${p.id}" title="${l.error}"><i class="ico ico-warn"></i>${shown ?? '?'}${rule}</button>`;
    if (pushOn(c.id) && shown !== want) return html`<button class="chc wait" data-act="rule" data-id="${p.id}" title="Kanala gönderim bekliyor">${shown ?? '?'} → ${want}${rule}</button>`;
    const v = pushOn(c.id) ? want : shown;
    return html`<button class="chc ${(v ?? 0) <= 0 ? 'zero' : ''}" data-act="rule" data-id="${p.id}" title="${pushOn(c.id) ? 'Kanaldaki stok' : `Kanaldaki stok (gönderim kapalı)${shown !== want ? ` · senkron açılınca ${want} olur` : ''}`}">${v ?? '?'}${rule}</button>`;
  };
  // Stok: büyük adet + hızlı −/+ (stok ikas'tan okunuyorsa yalnız adet)
  const stockCtl = (p) => siteStock(p) ? html`<span class="stk ${cls(p)}" title="ikas sitesinden okunur (stok senkronu kapalı). Adedi ikas panelinden değiştirin."><span class="dot"></span><b class="num val">${p.stock}</b></span>`
    : html`<div class="stock-ctl"><button class="round" data-act="dec" data-id="${p.id}" aria-label="Stok azalt"><i class="ico ico-minus"></i></button>
      <button class="stk ${cls(p)}" data-act="stock" data-id="${p.id}" title="Stok girişi / sayım"><span class="dot"></span><b class="num val">${p.stock}</b></button>
      <button class="round" data-act="inc" data-id="${p.id}" aria-label="Stok artır"><i class="ico ico-plus"></i></button></div>`;
  // Kaç gün yeter: son 30 günün satış hızına göre; 60 güne kadar çubuk
  const runway = (p) => {
    if (p.stock <= 0) return html`<span class="pill bad">Tükendi</span>`;
    if (p.days_left == null) return html`<span class="muted tiny">satış yok</span>`;
    const d = p.days_left, c = d <= 14 ? 'bad' : d <= 30 ? 'amber' : 'good';
    return html`<div class="runway ${c}" title="Son 30 günde ${p.sold30} adet satıldı"><span class="bar"><span style="width:${Math.min(100, (d / 60) * 100)}%"></span></span><b class="num">≈ ${d} gün</b></div>`;
  };
  const pname = (p) => html`<div class="pname" style="max-width:340px">${p.group_name || p.name}${p.variant_name ? html`<span class="var-tag">${p.variant_name}</span>` : ''}</div>`;

  function draw() {
    const c = counts;
    const cnt = { all: c.all, out: c.out, runout: c.runout, below: c.below, enough: c.enough };
    render($('[data-kpis]', el), html`${STATUS.map(([k, t, ck, ic, tone]) => html`<button class="sstat ${f.status === k && !f.extra ? 'on' : ''} ${tone}" data-act="status" data-k="${k}">
        <span class="ic"><i class="ico ico-${ic}"></i></span><div><b class="num">${n(cnt[ck] || 0)}</b><span>${t}</span></div></button>`)}`);
    const waiting = dash ? dash.stock.waiting : 0;
    render($('[data-sync]', el), syncOn() ? (waiting ? html`<div class="notice warn"><i class="ico ico-upload"></i><div style="flex:1"><b>${n(waiting)} kanal ilanı</b> güncel stoğu bekliyor; birkaç dakika içinde gönderilir.</div><button class="btn sm" data-act="push">Şimdi gönder</button></div>` : '')
      : html`<div class="sync-strip"><i class="ico ico-warn"></i><span><b>Stok gönderimi kapalı</b> — stoklar ikas sitesinden okunur, kanallara gönderilmez.${waiting ? ` ${n(waiting)} ilanın stoğu farklı.` : ''}</span><a class="link" href="#/ayarlar">Ayarlar → Stok</a></div>`);
    const pushBtn = $('[data-push]', el);
    if (pushBtn) pushBtn.hidden = !syncOn() && !chs().some((x) => pushOn(x.id));
    const empty = html`<div class="empty-state"><div class="ic"><i class="ico ico-db"></i></div><b>Bu bölümde ürün yok</b><span>${f.status === 'out' ? 'Stokta olmayan ürün yok. 🎉' : 'Aramayı ya da filtreyi değiştirin.'}</span></div>`;
    const body = !rows.length ? empty
      : isMobile() ? html`<div class="m-list">${rows.map((p) => html`<div class="m-card" data-pid="${p.id}"><div class="top">${thumb(p.image, p.name, 'sm')}<div style="min-width:0;flex:1">${pname(p)}<div class="muted tiny">${p.sku || ''}</div></div>${stockCtl(p)}</div>
          <div class="row">${runway(p)}</div>
          <div class="row wrap" style="gap:6px">${chs().map((c2) => html`<span class="row tiny" style="gap:4px">${chLogo(c2.id, true)}${cell(p, c2)}</span>`)}</div></div>`)}</div>`
        : html`<div class="table-wrap"><table class="t stock-t"><thead><tr><th>Ürün</th><th class="c">Stok</th><th>Kaç gün yeter</th><th class="r">30 gün satış</th>${chs().map((c2) => html`<th class="c" title="${c2.name}">${chLogo(c2.id, true)}</th>`)}<th></th></tr></thead><tbody>
          ${rows.map((p) => html`<tr data-pid="${p.id}"><td><div class="prod-cell">${thumb(p.image, p.name, 'sm')}<div style="min-width:0">${pname(p)}<div class="psub"><span class="codes">${p.sku ? html`<span>${p.sku}</span>` : ''}${p.barcode ? html`<span>${p.barcode}</span>` : ''}</span><span>kritik ≤ ${p.critical_stock || low()}</span></div></div></div></td>
            <td class="c">${stockCtl(p)}</td><td>${runway(p)}</td><td class="r num">${n(p.sold30 || 0)}</td>
            ${chs().map((c2) => html`<td class="c">${cell(p, c2)}</td>`)}<td class="r"><button class="icon-btn sm" data-act="menu" data-id="${p.id}" aria-label="İşlemler"><i class="ico ico-dots"></i></button></td></tr>`)}
        </tbody></table></div>`;
    render($('[data-box]', el), html`${body}${rows.length ? html`<div class="pager"><span class="muted small" style="margin-right:auto">${n(total)} ürün${rows.length < total ? ` · ${rows.length} gösteriliyor` : ''}</span>${rows.length < total ? html`<button class="btn sm" data-act="more">Daha fazla göster</button>` : ''}</div>` : ''}`);
  }
  async function load(append = false) {
    setQuery({ durum: f.status, f: f.extra, q: f.q, sort: f.sort === 'sold' ? '' : f.sort });
    const p = new URLSearchParams({ page: f.page, limit: 50 });
    if (f.sort) p.set('sort', f.sort);
    if (f.q) p.set('q', f.q);
    if (f.extra) p.set('filter', f.extra); else if (f.status) p.set('filter', f.status);
    const [r, d] = await Promise.all([api('products?' + p), dash && append ? dash : api('dashboard')]);
    rows = append ? rows.concat(r.products) : r.products; total = r.total; counts = r.counts || {}; dash = d;
    if (f.extra && f.status) rows = rows.filter((x) => (f.status === 'out' ? x.stock <= 0 : f.status === 'runout' ? x.stock > 0 && x.days_left != null && x.days_left <= 14 : f.status === 'below' ? x.stock > 0 && x.stock <= x.low_limit : x.stock > x.low_limit));
    draw();
  }
  const refresh = () => { f.page = 1; return load().catch((e) => toast(e.message, true)); };
  const bump = quickStock(() => rows, el);
  const byId = (id) => rows.find((x) => x.id === Number(id));
  actions(el, {
    status: (t) => { f.status = t.dataset.k; f.extra = ''; const x = $('[data-extra]', el); if (x) x.value = ''; refresh(); },
    more: () => { f.page++; load(true); },
    inc: (t) => bump(t.dataset.id, 1),
    dec: (t) => bump(t.dataset.id, -1),
    stock: (t) => stockDialog(byId(t.dataset.id), refresh),
    rule: (t) => ruleDialog(byId(t.dataset.id), refresh),
    menu: (t) => {
      const p = byId(t.dataset.id);
      if (!p) return;
      popMenu(t, [
        ...(siteStock(p) ? [] : [{ icon: 'db', label: 'Stok girişi / çıkış / sayım', run: () => stockDialog(p, refresh) }]),
        ...((p.listings || []).length ? [{ icon: 'link', label: 'Kanal stok kuralları', run: () => ruleDialog(p, refresh) }] : []),
        { icon: 'gear', label: 'Ürünü aç', run: () => productForm(p.id, refresh) },
      ], { title: p.name });
    },
    push: (t) => busy(t, async () => { const r = await api('push-stock', { method: 'POST' }); toast(r.skipped || Object.entries(r).map(([k, v]) => `${ch(k).name}: ${v}`).join(' · ') || 'Gönderilecek değişiklik yok'); refresh(); }),
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-extra]')) { f.extra = e.target.value; refresh(); }
    if (e.target.matches('[data-sort]')) { f.sort = e.target.value; refresh(); }
  });
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
