// İadeler: pazaryerlerinden (Trendyol, Hepsiburada) gelen iade talepleri her senkronda çekilir; burada listelenir,
// karar bekleyenler panelden onaylanır ya da gerekçe (ve isteğe bağlı fotoğraf / PDF) ile reddedilir.
import { api, html, render, $, n, money, ch, chBadge, chLogo, thumb, actions, busy, toast, debounce, sheet, ago, dateTime, activeChannels } from '../core.js';
import { setQuery, loadSummary } from '../app.js';
import { openOrder } from './orderops.js';

const TABS = [['waiting', 'Karar bekleyen'], ['accepted', 'Onaylanan'], ['rejected', 'Reddedilen'], ['other', 'Diğer'], ['', 'Tümü']];
export const claimChannels = () => activeChannels().filter((c) => (c.enabled || c.demo) && c.claims);
const ST = { waiting: ['warn', 'Karar bekliyor'], accepted: ['good', 'Onaylandı'], rejected: ['bad', 'Reddedildi'], other: ['', 'Süreçte'] };

export async function claimsView(el, rest, query = {}) {
  const f = { status: query.durum ?? 'waiting', channel: query.channel || '', q: query.q || '', page: 1 };
  let data = { rows: [], counts: {}, total: 0 };
  render(el, html`<div class="stack">
    <div class="ch-tabs" data-chs></div>
    <div class="row wrap"><div class="tabs" style="flex:1;min-width:0" data-tabs></div>
      <div class="search" style="min-width:min(100%,220px)"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Sipariş no, müşteri, ürün" data-q value="${f.q}"></div>
      <button class="btn" data-act="sync"><i class="ico ico-sync"></i>İadeleri yenile</button></div>
    <div class="notice small"><i class="ico ico-warn"></i><div>Onay ve ret kararları doğrudan pazaryerine gönderilir ve geri alınamaz. Ürün size ulaşıp kontrol edilmeden karar vermeyin; ret için gerekçe seçin, mümkünse fotoğraf ekleyin.</div></div>
    <div data-box></div>
  </div>`);

  function card(r) {
    const s = ST[r.status] || ST.other, open = r.status === 'waiting' ? r.lines.filter((l) => l.status === 'waiting' || !l.status) : [];
    return html`<div class="card stack" data-key="${r.channel}|${r.remote_id}">
      <div class="row wrap" style="align-items:flex-start;gap:8px">
        <div style="flex:1;min-width:200px"><div class="row wrap small" style="gap:8px">${chBadge(r.channel)}<b>#${r.order_number}</b>${r.order_id ? html`<a class="link small" href="#" data-act="order" data-id="${r.order_id}">siparişi aç</a>` : ''}</div>
          <div class="muted small" style="margin-top:2px">${r.customer || 'Müşteri'} · <span title="${dateTime(r.claimed_at)}">${ago(r.claimed_at)}</span>${r.cargo || r.tracking ? ` · ${[r.cargo, r.tracking].filter(Boolean).join(' ')}` : ''}</div></div>
        <span class="pill ${s[0]}">${s[1]}</span><b class="num">${money(r.amount)}</b></div>
      <div class="stack" style="gap:8px">${r.lines.map((l) => html`<div class="row" style="align-items:flex-start;gap:10px">${thumb(l.image, l.name, 'sm')}
        <div style="flex:1;min-width:0"><div style="font-weight:600" class="clamp2">${l.name || l.sku}</div>
          <div class="tiny muted">${[l.barcode || l.sku, `${n(l.qty)} adet`, money(l.price)].filter(Boolean).join(' · ')}</div>
          <div class="small" style="margin-top:2px"><b>Gerekçe:</b> ${l.reason || '—'}${l.remoteStatus ? html` <span class="muted tiny">(${l.remoteStatus})</span>` : ''}</div>
          ${l.note ? html`<div class="small qtext" style="margin-top:4px">“${l.note}”</div>` : ''}</div></div>`)}</div>
      ${r.decided_by ? html`<div class="tiny muted">${r.decided_by} · ${dateTime(r.decided_at)}${r.decision_note ? ` · ${r.decision_note}` : ''}</div>` : ''}
      ${r.error ? html`<div class="notice bad small">${r.error}</div>` : ''}
      ${open.length ? html`<div class="row wrap" style="justify-content:flex-end;gap:8px"><button class="btn" data-act="reject"><i class="ico ico-x"></i>Reddet</button><button class="btn primary" data-act="approve"><i class="ico ico-check"></i>İadeyi onayla</button></div>` : ''}
    </div>`;
  }
  function draw() {
    const c = data.counts, total = Object.values(c).reduce((a, x) => a + x, 0);
    render($('[data-chs]', el), html`<button class="ch-tab ${!f.channel ? 'on' : ''}" data-act="ch" data-id=""><i class="ico ico-grid"></i>Tüm kanallar</button>${claimChannels().map((x) => html`<button class="ch-tab ${f.channel === x.id ? 'on' : ''}" data-act="ch" data-id="${x.id}">${chLogo(x.id)}${x.name}</button>`)}`);
    render($('[data-tabs]', el), html`${TABS.map(([k, t]) => html`<button class="tab ${f.status === k ? 'on' : ''}" data-act="st" data-k="${k}">${t}<span class="n">${k ? c[k] || 0 : total}</span></button>`)}`);
    if (!claimChannels().length) return render($('[data-box]', el), html`<div class="card empty">İade servisini destekleyen bağlı kanal yok. Trendyol ya da Hepsiburada bağlanınca iade talepleri burada görünür (Entegrasyonlar).</div>`);
    render($('[data-box]', el), data.rows.length ? html`<div class="stack">${data.rows.map(card)}</div>
      <div class="pager"><span class="muted small" style="margin-right:auto">${n(data.total)} talep</span>${f.page > 1 ? html`<button class="btn sm" data-act="page" data-k="-1">Önceki</button>` : ''}${f.page * 30 < data.total ? html`<button class="btn sm" data-act="page" data-k="1">Sonraki</button>` : ''}</div>`
      : html`<div class="card empty">${f.status === 'waiting' ? 'Karar bekleyen iade talebi yok' : 'Bu filtrede iade talebi yok'}</div>`);
  }
  async function load() {
    setQuery({ durum: f.status, channel: f.channel, q: f.q });
    const p = new URLSearchParams({ page: f.page });
    for (const k of ['status', 'channel', 'q']) if (f[k]) p.set(k, f[k]);
    data = await api('claims?' + p);
    draw();
  }
  const refresh = () => load().catch((e) => toast(e.message, true));
  const rowOf = (t) => { const [c, id] = t.closest('[data-key]').dataset.key.split('|'); return data.rows.find((r) => r.channel === c && String(r.remote_id) === id); };
  const done = async (msg) => { toast(msg); await Promise.all([load(), loadSummary().catch(() => {})]); };

  async function rejectSheet(r) {
    const s = sheet({ title: `İadeyi reddet · #${r.order_number}`, size: 'narrow', body: html`<div class="empty"><i class="ico ico-sync spin"></i></div>` });
    const reasons = (await api(`claims/reasons?channel=${r.channel}`).catch(() => ({ reasons: [] }))).reasons;
    s.setBody(html`<form class="stack" data-f>
      <label class="field"><span>Ret gerekçesi</span><select class="input" name="reason" required><option value="">Seçin</option>${reasons.map((x) => html`<option value="${x.id}">${x.name}</option>`)}</select></label>
      <label class="field"><span>Açıklama (müşteri ve ${ch(r.channel).name} görür)</span><textarea class="input" name="text" maxlength="500" rows="4" required placeholder="Ör. Ürün kullanılmış ve ambalajı açılmış olarak geldi; fotoğraflar ektedir."></textarea></label>
      ${ch(r.channel).type === 'trendyol' || ch(r.channel).demo ? html`<label class="field"><span>Fotoğraf / PDF (önerilir, en fazla 5 MB)</span><input class="input" type="file" name="file" accept="image/jpeg,image/png,application/pdf"></label>` : ''}
      <div class="muted tiny">Ret kararı pazaryerine gönderilir; pazaryeri gerekirse talebi inceler.</div></form>`);
    s.setFoot(html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn danger" data-x="go"><i class="ico ico-x"></i>Reddet</button>`);
    s.el.addEventListener('click', (e) => { const b = e.target.closest('[data-x=go]'); if (!b) return; busy(b, async () => {
      const fm = $('[data-f]', s.el);
      if (!fm.reportValidity()) return;
      let file = null;
      const fl = fm.file && fm.file.files[0];
      if (fl) {
        if (fl.size > 5 * 1024 * 1024) return toast('Dosya en fazla 5 MB olabilir', true);
        const buf = new Uint8Array(await fl.arrayBuffer()); let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        file = { name: fl.name, type: fl.type, data: btoa(bin) };
      }
      const sel = fm.reason.selectedOptions[0];
      await api(`claims/${r.channel}/${encodeURIComponent(r.remote_id)}/reject`, { method: 'POST', body: { reasonId: fm.reason.value, reason: sel ? sel.textContent : '', text: fm.text.value.trim(), file } });
      s.close(); await done('İade talebi reddedildi');
    }); });
  }

  actions(el, {
    ch: (t) => { f.channel = t.dataset.id; f.page = 1; refresh(); },
    st: (t) => { f.status = t.dataset.k; f.page = 1; refresh(); },
    page: (t) => { f.page += Number(t.dataset.k); refresh(); },
    order: (t) => openOrder(t.dataset.id),
    sync: (t) => busy(t, async () => { const r = await api('claims/sync', { method: 'POST' }); toast(Object.entries(r).map(([k, v]) => `${ch(k).name}: ${typeof v === 'string' ? v : `${v} talep`}`).join(' · ') || 'İade servisi olan bağlı kanal yok'); await load(); }),
    approve: (t) => busy(t, async () => {
      const r = rowOf(t);
      if (!confirm(`#${r.order_number} siparişinin iadesi ${ch(r.channel).name}'da onaylansın mı? Müşteriye ödeme iadesi yapılır; bu işlem geri alınamaz.`)) return;
      await api(`claims/${r.channel}/${encodeURIComponent(r.remote_id)}/approve`, { method: 'POST', body: {} });
      await done('İade onaylandı');
    }),
    reject: (t) => rejectSheet(rowOf(t)),
  });
  $('[data-q]', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); f.page = 1; refresh(); }, 300));
  await refresh();
  return { refresh };
}
