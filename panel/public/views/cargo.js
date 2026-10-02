// Kargo: paketler üç aşamada — etiket bekleyen, kargoya verilecek, kargoda. Etiketler kanalların kendi kargo
// sistemlerinden gelir (Trendyol ortak etiketi, Hepsiburada paket etiketi, ikas/PttAVM kargo barkodu).
import { api, state, html, render, $, ch, chLogo, chBadge, shortDT, isMobile, actions, busy, toast } from '../core.js';
import { packageAction, openOrder, bulkLabels } from './orderops.js';

const TABS = [['waiting', 'Etiket bekleyen'], ['ready', 'Kargoya verilecek'], ['shipped', 'Kargoda (30 gün)']];

export async function cargo(el) {
  const f = { state: 'waiting', channel: '' };
  const sel = new Set();
  let data = { packages: [], unpacked: [], counts: {} };
  render(el, html`<div class="stack">
    <div class="notice"><i class="ico ico-truck"></i><div>Kargo etiketleri <b>kanalların kendi sistemlerinden</b> alınır: Trendyol ortak etiketi, Hepsiburada paket etiketi; ikas ve PttAVM'de kanalın kargo barkodu etikete basılır. Ayrı kargo firması entegrasyonu yoktur.</div></div>
    <div class="ch-tabs" data-chtabs></div>
    <div class="tabs" data-tabs></div>
    <div class="card flush" data-box></div>
  </div>`);
  const rowsOf = () => [
    ...data.unpacked.map((o) => ({ key: `o:${o.order_id}`, order_id: o.order_id, pkg: null, no: 1, total: 1, channel: o.channel, order_number: o.order_number, customer: o.customer, city: o.city, ordered_at: o.ordered_at, cargo: o.cargo_company, code: o.tracking, items: `${o.qty || 0} adet`, ls: ['warn', 'Paket oluşturulmadı'] })),
    ...data.packages.map((p) => {
      const caps = (ch(p.channel).caps || {});
      const ls = p.status === 'shipped' ? ['shipped', 'Kargoda'] : caps.label ? (p.has_label ? ['good', 'Etiket hazır'] : ['warn', 'Etiket bekliyor']) : p.barcode || p.tracking ? ['good', 'Barkod hazır'] : ['warn', 'Barkod bekleniyor'];
      return { key: `p:${p.id}`, order_id: p.order_id, pkg: p.id, no: p.no, total: p.pkg_total, channel: p.channel, order_number: p.order_number, customer: p.customer, city: p.city, ordered_at: p.ordered_at, cargo: p.cargo_company, code: p.tracking || p.barcode, items: `${p.items.reduce((a, x) => a + x.qty, 0)} adet`, ls, shipped: p.shipped_at };
    }),
  ];
  const acts = (r) => html`<div class="row" style="justify-content:flex-end;flex-wrap:nowrap">
    ${f.state !== 'shipped' ? html`<button class="btn sm outline" data-act="label" data-o="${r.order_id}" data-p="${r.pkg || ''}"><i class="ico ico-${r.ls[0] === 'good' ? 'print' : 'tag'}"></i>${r.ls[0] === 'good' ? 'Etiketi yazdır' : 'Etiket oluştur'}</button>
      <button class="btn sm primary" data-act="ship" data-o="${r.order_id}" data-p="${r.pkg || ''}"><i class="ico ico-truck"></i>Kargoya ver</button>`
      : html`<button class="btn sm outline" data-act="label" data-o="${r.order_id}" data-p="${r.pkg || ''}"><i class="ico ico-print"></i>Etiket</button>`}
    <button class="btn sm ghost" data-act="open" data-o="${r.order_id}">Yönet</button></div>`;
  function draw() {
    const c = data.counts;
    render($('[data-chtabs]', el), html`<button class="ch-tab ${!f.channel ? 'on' : ''}" data-act="ch" data-id=""><i class="ico ico-grid"></i>Tüm kanallar</button>${state.channels.map((x) => html`<button class="ch-tab ${f.channel === x.id ? 'on' : ''}" data-act="ch" data-id="${x.id}">${chLogo(x.id)}${x.name}</button>`)}`);
    render($('[data-tabs]', el), html`${TABS.map(([k, t]) => html`<button class="tab ${f.state === k ? 'on' : ''}" data-act="tab" data-k="${k}">${t}<span class="n">${c[k] || 0}</span></button>`)}`);
    const rows = rowsOf();
    const bulk = sel.size ? html`<div class="bulk"><b>${sel.size} sipariş seçildi</b><button class="btn sm outline" data-act="bulk-label"><i class="ico ico-tag"></i>Etiketleri oluştur ve yazdır</button><button class="icon-btn" data-act="clearsel" aria-label="Seçimi temizle"><i class="ico ico-x"></i></button></div>` : '';
    const empty = html`<div class="empty">${f.state === 'waiting' ? 'Etiket bekleyen paket yok 🎉' : f.state === 'ready' ? 'Kargoya verilecek paket yok' : 'Son 30 günde kargoya verilen paket yok'}</div>`;
    const body = !rows.length ? empty : isMobile()
      ? html`<div class="m-list" style="padding:12px">${rows.map((r) => html`<div class="m-card"><div class="top"><input type="checkbox" class="cb" data-sel="${r.order_id}" ${sel.has(r.order_id) ? 'checked' : ''}>${chLogo(r.channel, true)}<b>#${r.order_number}</b><span class="muted tiny">Paket ${r.no}/${r.total}</span><span class="spacer"></span><span class="pill ${r.ls[0]}">${r.ls[1]}</span></div>
          <div class="small">${r.customer}${r.city ? ` · ${r.city}` : ''} · ${r.items}</div><div class="small muted">${[r.cargo, r.code].filter(Boolean).join(' · ') || '—'}</div>${acts(r)}</div>`)}</div>`
      : html`<div class="table-wrap"><table class="t"><thead><tr><th></th><th>Sipariş / Paket</th><th>Kanal</th><th class="col-cust">Alıcı</th><th>Kargo / barkod</th><th>Etiket</th><th class="r">İşlemler</th></tr></thead><tbody>
          ${rows.map((r) => html`<tr><td style="width:40px"><input type="checkbox" class="cb" data-sel="${r.order_id}" ${sel.has(r.order_id) ? 'checked' : ''} aria-label="Seç"></td>
            <td style="white-space:nowrap"><b>#${r.order_number}</b><div class="muted tiny">Paket ${r.no}/${r.total} · ${r.items} · ${shortDT(r.shipped || r.ordered_at)}</div></td><td style="white-space:nowrap">${chBadge(r.channel)}</td>
            <td class="col-cust"><div class="ellipsis" style="max-width:150px;font-weight:600">${r.customer}</div><div class="muted tiny">${r.city}</div></td>
            <td class="small">${r.cargo || '—'}<div class="muted tiny">${r.code || ''}</div></td><td><span class="pill ${r.ls[0]}">${r.ls[1]}</span></td><td class="r">${acts(r)}</td></tr>`)}
        </tbody></table></div>`;
    render($('[data-box]', el), html`${bulk}${body}`);
  }
  async function load() {
    const p = new URLSearchParams({ state: f.state });
    if (f.channel) p.set('channel', f.channel);
    data = await api('packages?' + p);
    draw();
  }
  const refresh = () => load().catch((e) => toast(e.message, true));
  actions(el, {
    ch: (t) => { f.channel = t.dataset.id; sel.clear(); refresh(); },
    tab: (t) => { f.state = t.dataset.k; sel.clear(); refresh(); },
    label: (t) => busy(t, () => packageAction('label', t.dataset.o, Number(t.dataset.p) || null, refresh)),
    ship: (t) => busy(t, () => packageAction('ship', t.dataset.o, Number(t.dataset.p) || null, refresh)),
    open: (t) => openOrder(t.dataset.o, refresh),
    clearsel: () => { sel.clear(); draw(); },
    'bulk-label': (t) => busy(t, async () => { await bulkLabels([...sel], { fetch: true }); sel.clear(); await load(); }),
  });
  el.addEventListener('change', (e) => { const c = e.target.closest('[data-sel]'); if (c) { c.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel); draw(); } });
  await refresh();
  return { refresh };
}
