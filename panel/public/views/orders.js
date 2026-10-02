// Siparişler: liste, filtre, toplu işlem; sipariş detayı (işleme al, paketlere böl, kargoya ver, etiket).
import { api, state, html, raw, render, $, $$, money, ago, dateTime, ch, chColor, chBadge, statusPill, STATUS_LABEL, actions, busy, toast, sheet, debounce, confirmBox, numIn } from '../core.js';
import { printLabels, downloadFile } from '../labels.js';

const TABS = [['active', 'Bekleyen'], ['new', 'Yeni'], ['processing', 'Hazırlanıyor'], ['shipped', 'Kargoda'], ['delivered', 'Teslim'], ['cancelled', 'İptal/İade'], ['all', 'Tümü']];

export async function orders(el, rest) {
  const f = { status: 'active', channel: rest[0] === 'kanal' ? rest[1] || '' : '', q: '', page: 1 };
  if (f.channel) f.status = 'all';
  const sel = new Set();
  let rows = [], counts = {}, more = false;

  render(el, html`
    <div class="stack">
      <div class="chips" data-tabs></div>
      <div class="row wrap">
        <div class="search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Sipariş no, müşteri, ürün, takip no" data-q></div>
        <select class="input" style="width:auto" data-ch><option value="">Tüm kanallar</option>${state.channels.map((c) => html`<option value="${c.id}">${c.name}</option>`)}</select>
      </div>
      <div class="list" data-list></div>
      <div class="row" style="justify-content:center"><button class="btn hide" data-act="more">Daha fazla göster</button></div>
    </div>
    <div class="bulkbar hide" data-bulk></div>`);
  $('[data-ch]', el).value = f.channel;

  function tabs() {
    const c = (k) => (k === 'active' ? (counts.new || 0) + (counts.processing || 0) : k === 'cancelled' ? (counts.cancelled || 0) + (counts.returned || 0) : k === 'all' ? null : counts[k] || 0);
    render($('[data-tabs]', el), html`${TABS.map(([k, t]) => html`<button class="chip ${f.status === k ? 'on' : ''}" data-act="tab" data-k="${k}">${t}${c(k) != null ? html` <span class="n">${c(k)}</span>` : ''}</button>`)}`);
  }
  function card(o) {
    const warn = [];
    if (o.unmatched) warn.push(html`<span class="pill warn" title="Ürün panelde eşleşmemiş; stok düşülmez"><i class="ico ico-warn"></i>${o.unmatched} eşleşmemiş ürün</span>`);
    if (o.extra && o.extra.awaitingPayment) warn.push(html`<span class="pill warn">Ödeme bekleniyor</span>`);
    return html`<div class="o-card" data-act="open" data-id="${o.id}">
      <label class="sel" data-act="noop"><input type="checkbox" data-sel="${o.id}" ${sel.has(o.id) ? 'checked' : ''} aria-label="Seç"></label>
      <div class="main">
        <div class="o-head"><span class="dot" style="background:${chColor(o.channel)}" title="${ch(o.channel).name}"></span><span class="o-no">${o.order_number}</span><span class="muted small ellipsis" style="white-space:nowrap">${ch(o.channel).short} · ${ago(o.ordered_at)}</span></div>
        <div class="ellipsis">${o.customer || '—'}${o.city ? html` <span class="muted">· ${o.city}</span>` : ''}</div>
      </div>
      <div class="amount num">${money(o.total)}</div>
      <div class="meta"><span class="muted small ellipsis" style="flex:1;min-width:120px">${o.preview}</span>${statusPill(o.status)}
        ${o.packages > 1 ? html`<span class="pill">${o.packages} paket</span>` : ''}${o.tracking ? html`<span class="pill"><i class="ico ico-truck"></i>${o.tracking}</span>` : ''}${warn}</div>
    </div>`;
  }
  function list() {
    render($('[data-list]', el), rows.length ? html`${rows.map(card)}` : html`<div class="card empty">Bu filtrede sipariş yok</div>`);
    $('[data-act=more]', el).classList.toggle('hide', !more);
    bulk();
  }
  function bulk() {
    const b = $('[data-bulk]', el);
    b.classList.toggle('hide', !sel.size);
    if (sel.size) render(b, html`<b>${sel.size} seçili</b><span class="spacer"></span><button class="btn sm" data-act="bulk-accept">İşleme al</button><button class="btn sm" data-act="bulk-label"><i class="ico ico-print"></i>Etiket</button><button class="icon-btn" style="color:inherit" data-act="clear" aria-label="Seçimi temizle"><i class="ico ico-x"></i></button>`);
  }
  async function load(append = false) {
    const p = new URLSearchParams({ status: f.status, page: f.page, limit: 40 });
    if (f.channel) p.set('channel', f.channel);
    if (f.q) p.set('q', f.q);
    const r = await api('orders?' + p);
    rows = append ? rows.concat(r.orders) : r.orders;
    counts = r.counts; more = r.orders.length === r.limit;
    tabs(); list();
  }
  const refresh = () => { f.page = 1; return load().catch((e) => toast(e.message, true)); };

  actions(el, {
    tab: (t) => { f.status = t.dataset.k; sel.clear(); refresh(); },
    open: (t, e) => { if (e.target.closest('[data-sel], .sel')) return; openOrder(t.dataset.id, refresh); },
    noop: () => {},
    more: () => { f.page++; load(true); },
    clear: () => { sel.clear(); list(); },
    'bulk-accept': (t) => busy(t, async () => {
      const r = await api('orders-bulk', { method: 'POST', body: { ids: [...sel], action: 'accept' } });
      toast(`${r.done.length} sipariş işleme alındı${r.errors.length ? `, ${r.errors.length} hata` : ''}`, !!r.errors.length);
      if (r.errors.length) console.warn(r.errors);
      sel.clear(); refresh();
    }),
    'bulk-label': (t) => busy(t, async () => {
      const r = await api('labels', { method: 'POST', body: { ids: [...sel] } });
      const list = r.orders.flatMap((o) => o.packages.filter((p) => p.status === 'open' || f.status === 'shipped').map((pkg) => ({ order: o, pkg })));
      if (!list.length) return toast('Yazdırılacak açık paket yok');
      printLabels(list, r.sender);
      if (r.errors.length) toast(r.errors.join(' · '), true);
    }),
  });
  el.addEventListener('change', (e) => {
    const c = e.target.closest('[data-sel]');
    if (c) { c.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel); bulk(); }
    if (e.target.matches('[data-ch]')) { f.channel = e.target.value; refresh(); }
  });
  $('[data-q]', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); if (f.q) f.status = 'all'; refresh(); }, 300));
  await refresh();
  return { refresh };
}

// ---------- sipariş detayı ----------
export async function openOrder(id, onChange) {
  const s = sheet({ title: 'Sipariş', size: 'wide', onClose: () => { if (location.hash.startsWith('#/siparisler/') && !location.hash.includes('/kanal/')) history.replaceState(null, '', '#/siparisler'); } });
  s.setBody(html`<div class="empty"><i class="ico ico-sync spin"></i></div>`);
  let data, mode = 'view';
  const changed = () => onChange && onChange();

  async function load() {
    data = await api('orders/' + encodeURIComponent(id));
    draw();
  }
  const caps = () => (data.channel && data.channel.caps) || {};
  const lineName = (o, lid) => { const i = o.items.find((x) => String(x.line_id) === String(lid)); return i ? i.product_name || i.name : lid; };

  function draw() {
    const o = data.order, p = data.profit, c = caps();
    s.title.textContent = `${ch(o.channel).name} · ${o.order_number}`;
    const live = o.items.filter((i) => i.status !== 'cancelled');
    const open = o.packages.filter((x) => x.status === 'open');
    const canAct = !['cancelled', 'returned', 'delivered'].includes(o.status);
    const a = o.address || {};
    s.setBody(html`
      <div class="row wrap" style="margin-bottom:14px">${statusPill(o.status)}<span class="muted small">${dateTime(o.ordered_at)}</span>
        ${o.remote_status ? html`<span class="muted tiny" title="Kanaldaki durum">(${o.remote_status})</span>` : ''}${o.extra && o.extra.awaitingPayment ? html`<span class="pill warn">Ödeme bekleniyor</span>` : ''}</div>
      ${canAct ? html`<div class="row wrap" style="margin-bottom:16px">
        ${o.status === 'new' ? html`<button class="btn primary" data-act="accept"><i class="ico ico-check"></i>İşleme al</button>` : ''}
        ${live.length > 1 || live.some((i) => i.quantity > 1) ? html`<button class="btn" data-act="split-mode"><i class="ico ico-split"></i>Paketlere böl</button>` : ''}
        ${o.status !== 'shipped' ? html`<button class="btn" data-act="ship-first"><i class="ico ico-truck"></i>Kargoya ver</button>` : ''}
        <button class="btn" data-act="labels"><i class="ico ico-print"></i>Etiket${o.packages.length > 1 ? 'ler' : ''}</button>
      </div>` : ''}
      ${c.split === 'remote-async' ? html`<div class="notice small" style="margin-bottom:14px">Trendyol'da paket bölme Trendyol tarafında yapılır; yeni paketler birkaç dakika sonra senkronla gelir.</div>` : ''}
      <div data-split></div>
      <div class="two-col">
        <div class="stack">
          <div class="card">
            <div class="card-head"><h3>Ürünler</h3><span class="muted small">${live.reduce((t, i) => t + i.quantity, 0)} adet</span></div>
            ${o.items.map((i) => html`<div class="item-row" style="${i.status === 'cancelled' ? 'opacity:.5' : ''}">
              <div class="thumb" style="${i.product_image || i.image ? `background-image:url('${(i.product_image || i.image).replace(/'/g, '')}')` : ''}">${i.product_image || i.image ? '' : (i.name || '?').slice(0, 2)}</div>
              <div style="min-width:0"><div class="ellipsis" style="font-weight:600">${i.product_name || i.name}</div>
                <div class="muted small">${[i.sku, i.barcode].filter(Boolean).join(' · ')}${i.status === 'cancelled' ? ' · İptal' : ''}</div>
                ${i.product_id ? html`<div class="tiny muted">Stok: <b>${i.product_stock}</b></div>` : html`<div class="tiny" style="color:var(--warn)">Panelde eşleşmemiş ürün — <a href="#/urunler/eslestir">eşleştir</a></div>`}
              </div>
              <div style="text-align:right" class="num"><div><b>${i.quantity}</b> × ${money(i.unit_price)}</div><div class="muted small">${money(i.total)}</div></div>
            </div>`)}
          </div>
          <div data-pkgs>${packages(o)}</div>
        </div>
        <div class="stack sticky">
          <div class="card">
            <div class="card-head"><h3>Alıcı</h3><button class="btn sm ghost" data-act="copy-addr"><i class="ico ico-copy"></i>Kopyala</button></div>
            <div style="font-weight:650">${a.name || o.customer}</div>
            <div class="small">${a.line}</div><div class="small">${[a.district, a.city].filter(Boolean).join(' / ')}</div>
            <div class="small muted">${a.phone || o.phone}${o.email ? ` · ${o.email}` : ''}</div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Kârlılık (tahmini)</h3></div>
            <dl class="kv">
              <dt>Satış</dt><dd>${money(p.revenue)}</dd>
              <dt>Komisyon</dt><dd>−${money(p.commission)}</dd>
              <dt>Kargo</dt><dd>−${money(p.shipping)}</dd>
              ${p.fee ? html`<dt>Hizmet bedeli</dt><dd>−${money(p.fee)}</dd>` : ''}
              <dt style="font-weight:600;color:var(--text)">Satıştan kalan</dt><dd style="font-weight:600">${money(p.payout)}</dd>
              <dt>Ürün maliyeti</dt><dd>−${money(p.cost)}</dd>
              <div class="total" style="display:contents"><dt>Kâr</dt><dd class="${p.profit >= 0 ? 'up' : 'down'}">${money(p.profit)}</dd></div>
            </dl>
            ${p.missingCost ? html`<div class="notice warn small" style="margin-top:10px">${p.missingCost} ürünün alış fiyatı girilmemiş; kâr olduğundan yüksek görünür.</div>` : ''}
          </div>
          <div class="card stack">
            <h3>Not ve ayarlar</h3>
            <label class="field"><span>Sipariş notu</span><textarea class="input" data-note>${o.note || ''}</textarea></label>
            <label class="field"><span>Bu siparişin kargo gideri (boş = varsayılan)</span><div class="input-group"><input class="input" inputmode="decimal" data-shipcost value="${o.shipping_cost ?? ''}"><span class="suffix">₺</span></div></label>
            <div class="row"><button class="btn sm" data-act="save-note">Kaydet</button><span class="spacer"></span>
              <select class="input" style="width:auto;min-height:32px;font-size:13px" data-status aria-label="Durumu elle değiştir"><option value="">Durumu değiştir…</option>${Object.entries(STATUS_LABEL).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></div>
          </div>
        </div>
      </div>`);
    if (mode === 'split') splitEditor();
  }

  function packages(o) {
    if (!o.packages.length) return html`<div class="card"><div class="card-head"><h3>Paket</h3></div><div class="muted small">Sipariş tek paket olarak gönderilecek. Birden fazla pakete ayırmak için “Paketlere böl”ü kullanın.</div></div>`;
    const companies = (state.settings && state.settings.cargo_companies) || [];
    return html`<div class="card"><div class="card-head"><h3>Paketler (${o.packages.length})</h3>${o.packages.some((p) => !p.remote_id && p.status === 'open') ? html`<button class="btn sm ghost" data-act="reset">Paketleri sıfırla</button>` : ''}</div>
      ${o.packages.map((p) => html`<div class="pkg" data-pkg="${p.id}">
        <div class="row wrap"><b>Paket ${p.no}</b>${p.status === 'shipped' ? html`<span class="pill shipped">Kargoda</span>` : p.status === 'cancelled' ? html`<span class="pill bad">İptal</span>` : html`<span class="pill processing">Hazırlanıyor</span>`}
          ${p.remote_id ? html`<span class="muted tiny">Kanal paket no: ${p.remote_id}</span>` : ''}<span class="spacer"></span>
          <button class="btn sm" data-act="label" data-id="${p.id}"><i class="ico ico-print"></i>Etiket</button></div>
        <div class="small" style="margin:6px 0">${p.items.map((x) => html`<div>${x.qty} × ${lineName(o, x.line_id)}</div>`)}</div>
        ${p.status === 'open' ? html`<div class="form-grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr))">
            <label class="field"><span>Kargo firması</span><input class="input" list="cargo-list" data-f="cargo" value="${p.cargo_company || o.cargo_company || ''}"></label>
            <label class="field"><span>Takip no</span><input class="input" data-f="tracking" value="${p.tracking || ''}" placeholder="${caps().ship === 'remote' && o.channel !== 'trendyol' ? '' : 'isteğe bağlı'}"></label>
            ${o.channel === 'trendyol' ? html`<label class="field"><span>Fatura no (isteğe bağlı)</span><input class="input" data-f="invoice"></label>` : ''}
            <label class="field"><span>Desi</span><input class="input" inputmode="decimal" data-f="desi" value="${p.desi || ''}"></label>
          </div>
          <div class="row" style="margin-top:10px"><button class="btn sm ghost" data-act="save-pkg" data-id="${p.id}">Kaydet</button><span class="spacer"></span><button class="btn sm primary" data-act="ship" data-id="${p.id}"><i class="ico ico-truck"></i>Kargoya ver</button></div>`
        : html`<div class="small muted">${[p.cargo_company, p.tracking].filter(Boolean).join(' · ') || 'Takip no yok'}</div>`}
      </div>`)}
      <datalist id="cargo-list">${companies.map((c) => html`<option value="${c}">`)}</datalist></div>`;
  }

  // Paket bölme: her ürün satırının adedini paketlere dağıt
  function splitEditor() {
    const o = data.order, live = o.items.filter((i) => i.status !== 'cancelled');
    let count = Math.max(2, o.packages.length);
    const grid = new Map(live.map((i) => [String(i.line_id), Array.from({ length: 8 }, (_, k) => 0)]));
    // Mevcut paketlerden başla, yoksa ilk paket her şeyi alır; ikinci satır ikinci pakete önerilir
    if (o.packages.length) o.packages.forEach((p, k) => p.items.forEach((x) => { const g = grid.get(String(x.line_id)); if (g) g[k] = x.qty; }));
    else live.forEach((i, k) => { grid.get(String(i.line_id))[live.length > 1 && k === live.length - 1 ? 1 : 0] = i.quantity; });
    const desi = Array.from({ length: 8 }, () => '');
    const box = $('[data-split]', s.body);
    const drawEd = () => {
      render(box, html`<div class="card" style="margin-bottom:16px;border-color:var(--accent)">
        <div class="card-head"><h3>Paketlere böl</h3><button class="btn sm" data-ed="add" ${count >= 8 ? 'disabled' : ''}><i class="ico ico-plus"></i>Paket</button><button class="btn sm" data-ed="del" ${count <= 1 ? 'disabled' : ''}><i class="ico ico-minus"></i></button></div>
        <div class="table-wrap"><table class="t split-table"><thead><tr><th>Ürün</th>${Array.from({ length: count }, (_, k) => html`<th>Paket ${k + 1}</th>`)}<th>Kalan</th></tr></thead><tbody>
          ${live.map((i) => { const g = grid.get(String(i.line_id)); const left = i.quantity - g.slice(0, count).reduce((a, b) => a + b, 0); return html`<tr>
            <td style="min-width:140px"><div class="ellipsis" style="max-width:240px;font-weight:600">${i.product_name || i.name}</div><div class="muted tiny">${i.quantity} adet</div></td>
            ${Array.from({ length: count }, (_, k) => html`<td><input class="input qty-in" type="number" min="0" max="${i.quantity}" inputmode="numeric" data-cell="${i.line_id}:${k}" value="${g[k]}"></td>`)}
            <td class="num" style="font-weight:700;color:${left ? 'var(--bad)' : 'var(--good)'}">${left}</td></tr>`; })}
          <tr><td class="muted small">Desi (isteğe bağlı)</td>${Array.from({ length: count }, (_, k) => html`<td><input class="input qty-in" inputmode="decimal" data-desi="${k}" value="${desi[k]}"></td>`)}<td></td></tr>
        </tbody></table></div>
        <div class="row" style="margin-top:12px"><span class="muted small">Her paket için ayrı kargo etiketi oluşturulur.</span><span class="spacer"></span><button class="btn" data-ed="cancel">Vazgeç</button><button class="btn primary" data-ed="save">Paketleri oluştur</button></div>
      </div>`);
    };
    drawEd();
    box.oninput = (e) => {
      const c = e.target.dataset.cell;
      if (c) { const [lid, k] = c.split(':'); grid.get(lid)[Number(k)] = Math.max(0, Math.round(numIn(e.target.value))); }
      if (e.target.dataset.desi) desi[Number(e.target.dataset.desi)] = e.target.value;
    };
    box.onchange = (e) => { if (e.target.dataset.cell) { const pos = e.target.dataset.cell; drawEd(); const n = $(`[data-cell="${pos}"]`, box); n && n.focus(); } };
    box.onclick = async (e) => {
      const b = e.target.closest('[data-ed]');
      if (!b) return;
      if (b.dataset.ed === 'add') { count++; drawEd(); }
      if (b.dataset.ed === 'del') { for (const g of grid.values()) { g[count - 2] += g[count - 1]; g[count - 1] = 0; } count--; drawEd(); }
      if (b.dataset.ed === 'cancel') { mode = 'view'; box.innerHTML = ''; }
      if (b.dataset.ed === 'save') {
        const groups = Array.from({ length: count }, (_, k) => ({ desi: numIn(desi[k]) || null, items: live.map((i) => ({ line_id: String(i.line_id), qty: grid.get(String(i.line_id))[k] })).filter((x) => x.qty > 0) })).filter((g) => g.items.length);
        const bad = live.find((i) => grid.get(String(i.line_id)).slice(0, count).reduce((a, x) => a + x, 0) !== i.quantity);
        if (bad) return toast(`“${bad.product_name || bad.name}” adetleri tam dağıtılmadı`, true);
        await busy(b, async () => {
          const r = await api(`orders/${encodeURIComponent(id)}/split`, { method: 'POST', body: { groups } });
          toast(r.message); mode = 'view'; await load(); changed();
        });
      }
    };
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function doLabel(pkgId, btn) {
    await busy(btn, async () => {
      const r = await api(`orders/${encodeURIComponent(id)}/label`, { method: 'POST', body: pkgId ? { package_id: pkgId } : {} });
      const o = r.order, pkg = o.packages.find((p) => p.id === r.package_id);
      data.order = o; draw();
      if (!r.official) {
        if (r.error) toast('Kanal etiketi alınamadı, panel etiketi yazdırılıyor: ' + r.error, true);
        return printLabels([{ order: o, pkg }], r.sender);
      }
      // Resmi etiket var: indir veya panel etiketini yazdır
      const ls = sheet({ title: `Paket ${pkg.no} etiketi`, size: 'narrow', body: html`<div class="stack">
        <div class="notice good"><i class="ico ico-check"></i><div>${ch(o.channel).name} kargo etiketi hazır (${r.official.format.toUpperCase()}).</div></div>
        <button class="btn primary block" data-l="dl"><i class="ico ico-download"></i>${r.official.format === 'pdf' ? 'PDF etiketini aç / indir' : 'ZPL dosyasını indir (termal yazıcı)'}</button>
        <button class="btn block" data-l="print"><i class="ico ico-print"></i>Panel etiketini yazdır (A6 / 100×150)</button>
        ${r.official.format === 'zpl' ? html`<p class="muted small" style="margin:0">ZPL dosyası Zebra ve uyumlu termal yazıcılarda doğrudan basılır. Termal yazıcınız yoksa panel etiketini kullanın; kargo barkodu aynı takip numarasıdır.</p>` : ''}
      </div>` });
      $('[data-l=dl]', ls.el).onclick = () => downloadFile(r.official.filename, r.official.data, r.official.format === 'pdf' ? 'application/pdf' : 'text/plain');
      $('[data-l=print]', ls.el).onclick = () => { ls.close(); printLabels([{ order: o, pkg }], r.sender); };
    });
  }

  actions(s.body, {
    accept: (t) => busy(t, async () => { const r = await api(`orders/${encodeURIComponent(id)}/accept`, { method: 'POST', body: {} }); toast(r.message); await load(); changed(); }),
    'split-mode': () => { mode = 'split'; splitEditor(); },
    'ship-first': async (t) => {
      const o = data.order;
      const openP = o.packages.filter((p) => p.status === 'open');
      if (openP.length > 1) { $('[data-pkgs]', s.body).scrollIntoView({ behavior: 'smooth' }); return toast('Her paketi kendi satırından kargoya verin'); }
      if (openP.length === 1) { $(`[data-pkg="${openP[0].id}"]`, s.body).scrollIntoView({ behavior: 'smooth' }); $(`[data-pkg="${openP[0].id}"] [data-f=tracking]`, s.body).focus(); return; }
      if (!(await confirmBox('Sipariş tek paket olarak kargoya verilecek. Takip numarasını sonra da girebilirsiniz.', 'Kargoya ver'))) return;
      busy(t, async () => { const r = await api(`orders/${encodeURIComponent(id)}/ship`, { method: 'POST', body: {} }); toast(r.message); await load(); changed(); });
    },
    labels: async (t) => {
      const o = data.order;
      if (o.packages.length > 1) {
        if (o.packages.some((p) => !p.tracking) && caps().label) toast('Kanal etiketleri için paket satırlarındaki “Etiket” düğmesini kullanın');
        return printLabels(o.packages.map((pkg) => ({ order: o, pkg })), state.settings && state.settings.sender);
      }
      doLabel(o.packages[0] && o.packages[0].id, t);
    },
    label: (t) => doLabel(Number(t.dataset.id), t),
    'save-pkg': (t) => busy(t, async () => {
      const box = t.closest('[data-pkg]');
      await api(`orders/${encodeURIComponent(id)}/tracking`, { method: 'POST', body: { package_id: Number(t.dataset.id), tracking: $('[data-f=tracking]', box).value, cargo_company: $('[data-f=cargo]', box).value, desi: $('[data-f=desi]', box).value } });
      toast('Kaydedildi'); await load();
    }),
    ship: (t) => busy(t, async () => {
      const box = t.closest('[data-pkg]'), inv = $('[data-f=invoice]', box);
      const r = await api(`orders/${encodeURIComponent(id)}/ship`, { method: 'POST', body: { package_id: Number(t.dataset.id), tracking: $('[data-f=tracking]', box).value.trim(), cargo_company: $('[data-f=cargo]', box).value.trim(), invoice_number: inv ? inv.value.trim() : '' } });
      toast(r.message); await load(); changed();
    }),
    reset: async (t) => { if (await confirmBox('Paneldeki paket bölmesi silinsin mi?', 'Sil')) busy(t, async () => { await api(`orders/${encodeURIComponent(id)}/reset-packages`, { method: 'POST', body: {} }); await load(); changed(); }); },
    'copy-addr': () => {
      const o = data.order, a = o.address || {};
      navigator.clipboard.writeText([a.name || o.customer, a.line, [a.district, a.city].filter(Boolean).join(' / '), a.phone || o.phone].filter(Boolean).join('\n')).then(() => toast('Adres kopyalandı'), () => toast('Kopyalanamadı', true));
    },
    'save-note': (t) => busy(t, async () => { await api(`orders/${encodeURIComponent(id)}/note`, { method: 'POST', body: { note: $('[data-note]', s.body).value, shipping_cost: $('[data-shipcost]', s.body).value } }); toast('Kaydedildi'); await load(); }),
  });
  s.body.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-status]') || !e.target.value) return;
    const v = e.target.value;
    if (!(await confirmBox(`Sipariş durumu elle “${STATUS_LABEL[v]}” yapılsın mı? (Sadece panelde değişir; iptalde ürünler stoğa geri eklenir.)`, 'Değiştir'))) { e.target.value = ''; return; }
    try { await api(`orders/${encodeURIComponent(id)}/status`, { method: 'POST', body: { status: v } }); toast('Durum güncellendi'); await load(); changed(); } catch (err) { toast(err.message, true); }
  });
  await load().catch((e) => s.setBody(html`<div class="notice bad">${e.message}</div>`));
}
