import { api, state, html, render, $, n, ch, chLogo, thumb, sheet, busy, esc, dateTime, store } from '../core.js';

// Hazırlama listesi: kargoya çıkacak siparişlerin ürün ürün özeti ("şundan şu kadar"); etiket basılmadan hazırlığa başlanır.
// Filtre: bugün gelenler / önceki günlerden / hepsi, kanal. Ürüne dokununca hangi siparişlerden geldiği açılır; toplanan ürün
// işaretlenir (bu cihazda, gün boyu saklanır). Siparişe göre görünüm: her siparişin içeriği.
export async function pickSheet({ channel = '', ids = [] } = {}) {
  const s = sheet({ title: 'Hazırlama listesi', size: 'wide', body: html`<div class="empty"><i class="ico ico-sync spin"></i></div>` });
  const f = { day: ids.length ? '' : 'all', channel, view: 'items', open: new Set() };
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const doneKey = 'hazirlama:' + today;
  const done = new Set(store.get(doneKey, []));
  const saveDone = () => store.set(doneKey, [...done]);
  let d = null;
  async function load() {
    const q = new URLSearchParams();
    if (f.channel) q.set('channel', f.channel);
    if (ids.length) q.set('ids', ids.join(','));
    if (f.day !== 'all' && f.day) q.set('day', f.day);
    d = await api('picklist?' + q, { fresh: true }).catch((e) => { s.setBody(html`<div class="notice bad">${e.message}</div>`); return null; });
    if (d) draw();
  }
  const scopeText = () => ids.length ? `${ids.length} seçili sipariş` : `${f.day === 'today' ? 'Bugün gelen' : f.day === 'old' ? 'Önceki günlerden kalan' : 'Hazırlanacak tüm'} siparişler${f.channel ? ` · ${ch(f.channel).name}` : ''}`;
  function draw() {
    const picked = d.items.filter((x) => done.has(x.key)).length, pct = d.items.length ? Math.round((picked / d.items.length) * 100) : 0;
    const seg = (k, t) => html`<button class="${f.day === k ? 'on' : ''}" data-day="${k}">${t}</button>`;
    s.setBody(html`<div class="stack">
      ${ids.length ? '' : html`<div class="row wrap" style="gap:8px"><div class="seg">${seg('all', 'Tümü')}${seg('today', 'Bugün gelenler')}${seg('old', 'Önceki günlerden')}</div>
        <span class="spacer"></span><div class="row wrap" style="gap:6px"><button class="chip ${!f.channel ? 'on' : ''}" data-chf="">Tüm kanallar</button>${Object.keys(d.channels || {}).concat(f.channel && !(d.channels || {})[f.channel] ? [f.channel] : []).map((c) => html`<button class="chip ${f.channel === c ? 'on' : ''}" data-chf="${c}">${chLogo(c, true)} ${(d.channels || {})[c] || 0}</button>`)}</div></div>`}
      ${!d.items.length ? html`<div class="empty">Hazırlanacak ürün yok 🎉 ${f.day === 'today' ? 'Bugün gelen ve kargoya çıkacak sipariş bulunmuyor.' : 'Kargoya çıkacak sipariş bulunmuyor.'}</div>` : html`
      <div class="kpis" style="--cols:4"><div class="kpi"><div class="label">Sipariş</div><div class="value num">${n(d.orders)}</div></div><div class="kpi"><div class="label">Ürün çeşidi</div><div class="value num">${n(d.items.length)}</div></div>
        <div class="kpi"><div class="label">Toplam adet</div><div class="value num">${n(d.totalQty)}</div></div><div class="kpi"><div class="label">Toplandı</div><div class="value num">${picked}/${d.items.length}</div><div class="pick-bar"><i style="width:${pct}%"></i></div></div></div>
      ${d.short ? html`<div class="notice warn small"><i class="ico ico-warn"></i><div><b>${d.short} üründe stok yetmiyor.</b> Bu ürünler kırmızıyla işaretli.</div></div>` : ''}
      <div class="row wrap" style="gap:8px"><b class="small">${scopeText()}</b><span class="spacer"></span><div class="seg"><button class="${f.view === 'items' ? 'on' : ''}" data-view="items">Ürüne göre</button><button class="${f.view === 'orders' ? 'on' : ''}" data-view="orders">Siparişe göre</button></div></div>
      ${f.view === 'items' ? html`<div class="pick-list">${d.items.map((x) => { const isDone = done.has(x.key), short = x.stock != null && x.stock < x.qty, opened = f.open.has(x.key); return html`<div class="pick-row ${isDone ? 'done' : ''}">
        <div class="pick-main" data-open="${x.key}">
          <label class="pick-cb" data-stop><input type="checkbox" data-done="${x.key}" ${isDone ? 'checked' : ''} aria-label="Toplandı"></label>
          ${thumb(x.image, x.name, 'sm')}
          <div style="min-width:0;flex:1"><div class="pick-name">${x.name}${x.variant ? html`<span class="var-tag">${x.variant}</span>` : ''}</div>
            <div class="muted tiny">${[x.sku, x.barcode].filter(Boolean).join(' · ')}${x.orders.length ? ` · ${x.orders.length} sipariş` : ''}${short ? html` · <b style="color:var(--bad)">stok ${x.stock}</b>` : x.stock != null ? ` · stok ${x.stock}` : ''}</div></div>
          <div class="pick-qty ${short ? 'neg' : ''}">${x.qty}<small>adet</small></div>
          <i class="ico ico-${opened ? 'up' : 'down'} muted"></i>
        </div>
        ${opened ? html`<div class="pick-orders">${x.orders.map((o) => html`<div class="row small" style="gap:8px">${chLogo(o.channel, true)}<b class="num">#${o.order_number}</b><span class="muted ellipsis" style="flex:1">${o.customer || ''}</span><span class="muted tiny">${o.ordered_at ? dateTime(o.ordered_at) : ''}</span><b class="num">×${o.qty}</b></div>`)}</div>` : ''}
      </div>`; })}</div>` : html`<div class="pick-list">${d.list.map((o) => html`<div class="pick-row"><div class="pick-main" style="cursor:default">${chLogo(o.channel, true)}<div style="min-width:0;flex:1"><div class="pick-name">#${o.order_number} <span class="muted small">${o.customer || ''}</span></div><div class="muted tiny">${o.ordered_at ? dateTime(o.ordered_at) : ''}</div></div><b class="num">${o.lines.reduce((a, l) => a + l.qty, 0)} adet</b></div>
        <div class="pick-orders">${o.lines.map((l) => html`<div class="row small" style="gap:8px">${thumb(l.image, l.name, 'xs')}<span style="flex:1;min-width:0" class="ellipsis">${l.name}${l.variant ? html`<span class="var-tag">${l.variant}</span>` : ''}</span><b class="num">×${l.qty}</b></div>`)}</div></div>`)}</div>`}`}
    </div>`);
    s.setFoot(d.items.length ? html`${picked ? html`<button class="btn ghost sm" data-reset>İşaretleri temizle</button>` : ''}<span class="spacer"></span><button class="btn" data-close>Kapat</button><button class="btn primary" data-print><i class="ico ico-print"></i>Yazdır</button>` : null);
    const pb = $('[data-print]', s.el);
    if (pb) pb.onclick = () => printList(d, scopeText(), f.view);
    const rb = $('[data-reset]', s.el);
    if (rb) rb.onclick = () => { done.clear(); saveDone(); draw(); };
  }
  s.el.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-stop]')) return;
    const day = t.closest('[data-day]'), chf = t.closest('[data-chf]'), view = t.closest('[data-view]'), op = t.closest('[data-open]');
    if (day) { f.day = day.dataset.day; load(); }
    else if (chf) { f.channel = chf.dataset.chf; load(); }
    else if (view) { f.view = view.dataset.view; draw(); }
    else if (op) { const k = op.dataset.open; f.open.has(k) ? f.open.delete(k) : f.open.add(k); draw(); }
  });
  s.el.addEventListener('change', (e) => {
    const k = e.target.dataset && e.target.dataset.done;
    if (!k) return;
    e.target.checked ? done.add(k) : done.delete(k); saveDone(); draw();
  });
  await load();
}

// Yazdırma: ayrı pencerede sade tablo (işaret kutusu, adet büyük); sipariş numaraları her ürünün altında
function printList(d, scope, view = 'items') {
  const w = window.open('', '_blank');
  if (!w) return alert('Yazdırma penceresi açılamadı (açılır pencere engelini kaldırın)');
  const rows = d.items.map((x) => `<tr><td class="box"></td><td><b>${esc(x.name)}</b>${x.variant ? ` <span class="v">${esc(x.variant)}</span>` : ''}<div class="m">${esc([x.sku, x.barcode].filter(Boolean).join(' · '))}</div>
    <div class="o">${x.orders.map((o) => `${esc(ch(o.channel).short || ch(o.channel).name)} #${esc(o.order_number)}${o.qty > 1 ? ` ×${o.qty}` : ''}`).join(' · ')}</div></td><td class="q">${x.qty}</td><td class="s">${x.stock ?? ''}</td></tr>`).join('');
  // Siparişe göre: her sipariş bir satır, içeriği altında
  const orderRows = (d.list || []).map((o) => `<tr><td class="box"></td><td><b>${esc(ch(o.channel).short || ch(o.channel).name)} #${esc(o.order_number)}</b> <span class="m">${esc(o.customer || '')}</span>
    <div class="o" style="font-size:12px;color:#222">${o.lines.map((l) => `${esc(l.name)}${l.variant ? ` (${esc(l.variant)})` : ''} <b>×${l.qty}</b>`).join('<br>')}</div></td><td class="q">${o.lines.reduce((a, l) => a + l.qty, 0)}</td><td class="s"></td></tr>`).join('');
  w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Hazırlama listesi</title><style>
    body{font:13px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:16px;color:#111}h1{font-size:18px;margin:0 0 4px}.sub{color:#555;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ccc;padding:7px 6px;vertical-align:top;text-align:left}th{font-size:11px;text-transform:uppercase;color:#555}
    .box{width:18px}.box:before{content:'';display:inline-block;width:14px;height:14px;border:1.5px solid #333;border-radius:3px}.q{font-size:20px;font-weight:800;text-align:right;width:60px}.s{text-align:right;color:#666;width:50px}
    .v{background:#eee;border-radius:4px;padding:0 5px;font-size:12px}.m{color:#555;font-size:11px}.o{color:#777;font-size:10.5px;margin-top:2px}@media print{body{margin:8mm}}
    .hd{display:flex;align-items:center;gap:14px;margin-bottom:6px}.hd img{max-height:46px;max-width:180px}
  </style></head><body><div class="hd">${state.settings && state.settings.logo ? `<img src="${esc(state.settings.logo)}" alt="">` : ''}<div><h1>Hazırlama listesi</h1>${state.settings && state.settings.company && state.settings.company.title ? `<div class="m">${esc(state.settings.company.title)}</div>` : ''}</div></div><div class="sub">${esc(scope)} · ${d.orders} sipariş · ${d.items.length} çeşit · <b>${d.totalQty} adet</b> · ${esc(dateTime(Date.now()))}</div>
  <table><thead><tr><th></th><th>${view === 'orders' ? 'Sipariş' : 'Ürün'}</th><th style="text-align:right">Adet</th><th style="text-align:right">${view === 'orders' ? '' : 'Stok'}</th></tr></thead><tbody>${view === 'orders' ? orderRows : rows}</tbody></table>
  </body></html>`);
  w.document.close();
  // Betik yazdırma penceresine gömülmez (güvenlik politikası): yazdırma bu pencereden başlatılır
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* pencere kapandı */ } }, 300);
}
