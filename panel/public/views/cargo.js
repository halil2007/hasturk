// Kargo: paketler dört aşamada — hazırlanacak (paketle + etiket al), etiketi yazdırılacak, kargoya verilecek (etiket
// yazdırıldı), kargoda. Etiketler kanalların kendi sistemlerinden gelir: ikas Kargo, Trendyol ortak etiketi, Hepsiburada paket etiketi.
import { api, html, render, $, ch, chLogo, chBadge, shortDT, isMobile, actions, busy, toast, lateBadge, activeChannels } from '../core.js';
import { packageAction, openOrder, bulkLabels, labelState } from './orderops.js';
import { setQuery, loadSummary } from '../app.js';

const TABS = [['waiting', 'Hazırlanacak'], ['ready', 'Etiketi yazdırılacak'], ['printed', 'Kargoya verilecek'], ['shipped', 'Kargoda (30 gün)']];

export async function cargo(el, rest, query = {}) {
  const f = { state: TABS.some(([k]) => k === query.durum) ? query.durum : 'waiting', channel: query.channel || '' };
  const sel = new Set();
  let data = { packages: [], unpacked: [], counts: {} };
  render(el, html`<div class="stack">
    <div class="notice"><i class="ico ico-truck"></i><div>Kargo etiketleri <b>kanalların kendi sistemlerinden</b> alınır: ikas Kargo (paket “Kargoya Hazır” olunca), Trendyol ortak etiketi, Hepsiburada paket etiketi. Kargo firması kanalın listesinden seçilir. “Paketle ve etiket al” her paketi kanalda kargoya hazırlar ve etiketini getirir.</div></div>
    <div class="ch-tabs" data-chtabs></div>
    <div class="tabs" data-tabs></div>
    <div class="card flush" data-box></div>
  </div>`);
  const rowsOf = () => [
    ...data.unpacked.map((o) => ({ key: `o:${o.order_id}`, order_id: o.order_id, pkg: null, no: 1, total: 1, channel: o.channel, order_number: o.order_number, customer: o.customer, city: o.city, ordered_at: o.ordered_at, cargo: o.cargo_company, code: o.tracking, items: `${o.qty || 0} adet`, ls: { key: 'unpacked', cls: 'warn', text: 'Paketlenmedi' }, late: { ...o, status: o.order_status, packages: 0 } })),
    ...data.packages.map((p) => ({
      key: `p:${p.id}`, order_id: p.order_id, pkg: p.id, no: p.no, total: p.pkg_total, channel: p.channel, order_number: p.order_number, customer: p.customer, city: p.city, ordered_at: p.ordered_at,
      cargo: p.cargo_company, code: p.barcode || p.tracking, items: `${p.items.reduce((a, x) => a + x.qty, 0)} adet`, ls: labelState({ channel: p.channel }, p), shipped: p.shipped_at, error: p.error,
      late: p.status === 'open' ? { ...p, status: p.order_status, packages: 1, open_packages: 1 } : null,
    })),
  ];
  // Satırın sıradaki adımı
  const next = (r) => {
    const o = `data-o="${r.order_id}" data-p="${r.pkg || ''}"`;
    if (f.state === 'shipped') return html`<button class="btn sm outline" data-act="label" ${o}><i class="ico ico-print"></i>Etiket</button>`;
    if (['unpacked', 'packed', 'created', 'error'].includes(r.ls.key)) return html`<button class="btn sm primary" data-act="label" ${o}><i class="ico ico-${r.ls.key === 'unpacked' ? 'box' : 'tag'}"></i>${r.ls.key === 'unpacked' ? 'Paketle ve etiket al' : r.ls.key === 'error' ? 'Tekrar dene' : r.ls.key === 'created' ? 'Etiketi al' : 'Etiket oluştur'}</button>`;
    if (r.ls.key === 'ready') return html`<button class="btn sm primary" data-act="label" ${o}><i class="ico ico-print"></i>Etiketi yazdır</button>`;
    return html`<button class="btn sm" data-act="label" ${o}><i class="ico ico-print"></i>Tekrar</button><button class="btn sm primary" data-act="ship" ${o}><i class="ico ico-truck"></i>Kargoya ver</button>`;
  };
  const acts = (r) => html`<div class="row" style="justify-content:flex-end;flex-wrap:nowrap">${next(r)}
    ${f.state !== 'shipped' && r.pkg && (ch(r.channel).caps || {}).cargo ? html`<button class="icon-btn sm" data-act="cargo" data-o="${r.order_id}" data-p="${r.pkg}" title="Kargo firması seç / değiştir" aria-label="Kargo firması"><i class="ico ico-truck"></i></button>` : ''}
    <button class="icon-btn sm" data-act="open" data-o="${r.order_id}" title="Siparişi yönet" aria-label="Siparişi yönet"><i class="ico ico-dots"></i></button></div>`;
  function draw() {
    const c = data.counts;
    render($('[data-chtabs]', el), html`<button class="ch-tab ${!f.channel ? 'on' : ''}" data-act="ch" data-id=""><i class="ico ico-grid"></i>Tüm kanallar</button>${activeChannels().filter((x) => x.enabled || x.demo).map((x) => html`<button class="ch-tab ${f.channel === x.id ? 'on' : ''}" data-act="ch" data-id="${x.id}">${chLogo(x.id)}${x.name}</button>`)}`);
    render($('[data-tabs]', el), html`${TABS.map(([k, t]) => html`<button class="tab ${f.state === k ? 'on' : ''}" data-act="tab" data-k="${k}">${t}<span class="n">${c[k] || 0}</span></button>`)}`);
    const rows = rowsOf();
    const bulk = sel.size ? html`<div class="bulk"><b>${sel.size} sipariş seçildi</b><button class="btn sm outline" data-act="bulk-label"><i class="ico ico-tag"></i>${f.state === 'waiting' ? 'Paketle, etiketleri al ve yazdır' : 'Etiketleri yazdır'}</button><button class="icon-btn" data-act="clearsel" aria-label="Seçimi temizle"><i class="ico ico-x"></i></button></div>` : '';
    const empty = html`<div class="empty">${{ waiting: 'Hazırlanacak paket yok 🎉', ready: 'Yazdırılmayı bekleyen etiket yok', printed: 'Kargoya verilecek paket yok', shipped: 'Son 30 günde kargoya verilen paket yok' }[f.state]}</div>`;
    const status = (r) => html`<span class="pill ${r.ls.cls}">${r.ls.text}</span>${r.late ? lateBadge(r.late) : ''}${r.error ? html`<div class="tiny" style="color:var(--bad);max-width:260px">${r.error}</div>` : ''}`;
    const body = !rows.length ? empty : isMobile()
      ? html`<div class="m-list" style="padding:12px">${rows.map((r) => html`<div class="m-card"><div class="top"><input type="checkbox" class="cb" data-sel="${r.order_id}" ${sel.has(r.order_id) ? 'checked' : ''}>${chLogo(r.channel, true)}<b>#${r.order_number}</b><span class="muted tiny">Paket ${r.no}/${r.total}</span></div>
          <div class="row wrap">${status(r)}</div>
          <div class="small">${r.customer}${r.city ? ` · ${r.city}` : ''} · ${r.items}</div><div class="small muted">${[r.cargo, r.code].filter(Boolean).join(' · ') || 'Kargo kanaldan belirlenecek'}</div>
          <div class="row wrap">${acts(r)}</div></div>`)}</div>`
      : html`<div class="table-wrap"><table class="t"><thead><tr><th></th><th>Sipariş / Paket</th><th>Kanal</th><th class="col-cust">Alıcı</th><th>Kargo / barkod</th><th>Durum</th><th class="r">İşlemler</th></tr></thead><tbody>
          ${rows.map((r) => html`<tr><td style="width:40px"><input type="checkbox" class="cb" data-sel="${r.order_id}" ${sel.has(r.order_id) ? 'checked' : ''} aria-label="Seç"></td>
            <td style="white-space:nowrap"><b>#${r.order_number}</b><div class="muted tiny">Paket ${r.no}/${r.total} · ${r.items} · ${shortDT(r.shipped || r.ordered_at)}</div></td><td style="white-space:nowrap">${chBadge(r.channel)}</td>
            <td class="col-cust"><div class="ellipsis" style="max-width:150px;font-weight:600">${r.customer}</div><div class="muted tiny">${r.city}</div></td>
            <td class="small">${r.cargo || '—'}<div class="muted tiny num">${r.code || ''}</div></td><td><div class="row wrap" style="gap:4px">${status(r)}</div></td><td class="r">${acts(r)}</td></tr>`)}
        </tbody></table></div>`;
    render($('[data-box]', el), html`${bulk}${body}`);
  }
  async function load() {
    setQuery({ durum: f.state === 'waiting' ? '' : f.state, channel: f.channel });
    const p = new URLSearchParams({ state: f.state });
    if (f.channel) p.set('channel', f.channel);
    data = await api('packages?' + p);
    draw();
  }
  const refresh = () => { loadSummary().catch(() => {}); return load().catch((e) => toast(e.message, true)); };
  actions(el, {
    ch: (t) => { f.channel = t.dataset.id; sel.clear(); refresh(); },
    tab: (t) => { f.state = t.dataset.k; sel.clear(); refresh(); },
    label: (t) => busy(t, () => packageAction('label', t.dataset.o, Number(t.dataset.p) || null, refresh)),
    ship: (t) => busy(t, () => packageAction('ship', t.dataset.o, Number(t.dataset.p) || null, refresh)),
    cargo: (t) => busy(t, () => packageAction('cargo', t.dataset.o, Number(t.dataset.p) || null, refresh)),
    open: (t) => openOrder(t.dataset.o, refresh),
    clearsel: () => { sel.clear(); draw(); },
    'bulk-label': (t) => busy(t, async () => { await bulkLabels([...sel], { fetch: true, done: refresh }); sel.clear(); await load(); }),
  });
  el.addEventListener('change', (e) => { const c = e.target.closest('[data-sel]'); if (c) { c.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel); draw(); } });
  await refresh();
  return { refresh };
}
