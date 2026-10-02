// Sipariş işlemleri (ortak bileşen): adım çubuğu, işleme al, paketlere böl / paket ekle, paket kartları,
// kanalın kendi kargo etiketi (oluştur / yazdır), kargoya ver. Siparişler tablosu, Genel Bakış ve Kargo sayfası kullanır.
import { api, state, html, render, $, $$, money, n, ch, chLogo, chBadge, statusPill, STATUS_LABEL, thumb, toast, busy, sheet, confirmBox, popMenu, numIn, dateTime, shortDT } from '../core.js';
import { printLabels, downloadFile } from '../labels.js';

const STEPS = [['new', 'Yeni'], ['processing', 'Hazırlanıyor'], ['shipped', 'Kargoda']];
export function stepper(status) {
  if (status === 'cancelled' || status === 'returned') return html`<div class="notice bad" style="margin:12px 0">${statusPill(status)}<span>Bu sipariş ${STATUS_LABEL[status].toLowerCase()} edildi; işlem yapılamaz.</span></div>`;
  const cur = status === 'delivered' ? 3 : STEPS.findIndex(([k]) => k === status);
  return html`<div class="stepper">${STEPS.map(([, t], i) => html`<div class="st ${i < cur ? 'done' : i === cur ? 'cur' : ''}"><span class="b">${i < cur ? html`<i class="ico ico-check"></i>` : ''}</span>${t}</div>`)}${status === 'delivered' ? html`<div class="st done"><span class="b"><i class="ico ico-check"></i></span>Teslim</div>` : ''}</div>`;
}

const lineOf = (o, lid) => o.items.find((i) => String(i.line_id) === String(lid)) || {};
// Etiket durumu: Trendyol/Hepsiburada kendi etiketini verir; ikas/PttAVM kendi kargo barkodunu (etikete basılır)
export function labelState(o, pkg, caps) {
  if (pkg.status === 'shipped') return { key: 'shipped', text: 'Kargoda', cls: 'shipped' };
  if (caps && caps.label) return pkg.has_label ? { key: 'ready', text: 'Etiket hazır', cls: 'good' } : { key: 'wait', text: 'Etiket bekliyor', cls: 'warn' };
  return pkg.barcode || pkg.tracking ? { key: 'ready', text: 'Etiket hazır', cls: 'good' } : { key: 'wait', text: 'Barkod bekleniyor', cls: 'warn' };
}

// Siparişin paketleri; hiç paket yoksa tüm sipariş tek "taslak" paket olarak gösterilir
function packagesOf(o) {
  if (o.packages.length) return o.packages;
  const items = o.items.filter((i) => i.status !== 'cancelled').map((i) => ({ line_id: i.line_id, qty: i.quantity }));
  return [{ id: 0, no: 1, items, status: ['shipped', 'delivered'].includes(o.status) ? 'shipped' : 'open', tracking: o.tracking, cargo_company: o.cargo_company, virtual: true }];
}

/**
 * Sipariş işlemlerini kapsayıcıya kurar.
 * mode: 'expand' (tablo satırı altı) | 'panel' (Genel Bakış sağ panel) | 'sheet' (tam detay)
 */
export function mountOps(el, id, { mode = 'expand', onChange } = {}) {
  let d = null;
  const enc = encodeURIComponent(id);
  const changed = async () => { await load(); onChange && onChange(); };
  async function load() {
    d = await api('orders/' + enc);
    draw();
  }
  const caps = () => (d.channel && d.channel.caps) || {};
  const live = () => !['cancelled', 'returned', 'delivered'].includes(d.order.status);

  function pkgCard(o, p, total) {
    const ls = labelState(o, p, caps());
    const qty = p.items.reduce((a, x) => a + x.qty, 0);
    const ready = ls.key === 'ready';
    return html`<div class="pkg-card" data-pkg="${p.id}">
      <div class="hd"><span class="box"><i class="ico ico-box"></i></span><b>Paket ${p.no}</b><span class="muted small">• ${qty} ürün</span><span class="spacer"></span><span class="pill ${ls.cls}">${ls.text}</span></div>
      ${mode === 'panel' ? html`<div class="small muted ellipsis">${p.items.map((x) => `${lineOf(o, x.line_id).product_name || lineOf(o, x.line_id).name} ×${x.qty}`).join(', ')}</div>`
        : p.items.map((x) => { const it = lineOf(o, x.line_id); return html`<div class="line">${thumb(it.product_image || it.image, it.name, 'sm')}<div style="min-width:0"><div class="ellipsis" style="font-weight:600">${it.product_name || it.name}</div><div class="muted tiny">${it.sku || ''}</div></div><span class="spacer"></span><b>×${x.qty}</b></div>`; })}
      ${mode !== 'panel' ? html`<div class="line small muted"><i class="ico ico-truck"></i><span class="ellipsis">${[p.cargo_company || o.cargo_company, p.tracking || p.barcode].filter(Boolean).join(' · ') || 'Kargo bilgisi kanaldan gelecek'}</span></div>` : ''}
      <div class="acts">
        ${ready || p.status === 'shipped'
          ? html`<button class="btn sm outline" data-op="print" data-id="${p.id}"><i class="ico ico-print"></i>Etiketi yazdır</button>`
          : html`<button class="btn sm outline" data-op="label" data-id="${p.id}"><i class="ico ico-tag"></i>Etiket oluştur</button>`}
        ${mode !== 'panel' ? html`<button class="btn sm" style="flex:0 0 auto" data-op="more" data-id="${p.id}" aria-label="Diğer işlemler"><i class="ico ico-dots"></i></button>` : ''}
        ${p.status === 'open' && live() && mode !== 'panel' ? html`<button class="btn sm primary" data-op="ship" data-id="${p.id}"><i class="ico ico-truck"></i>Kargoya ver</button>` : ''}
      </div>
    </div>`;
  }

  function draw() {
    const o = d.order, pk = packagesOf(o), c = caps();
    const qty = o.items.filter((i) => i.status !== 'cancelled').reduce((a, i) => a + i.quantity, 0);
    const splittable = live() && o.status !== 'shipped' && (o.items.filter((i) => i.status !== 'cancelled').length > 1 || qty > 1);
    const unmatched = o.items.filter((i) => !i.product_id).length;
    const stockNote = unmatched
      ? html`<div class="row small" style="color:var(--amber)"><i class="ico ico-warn"></i>${unmatched} ürün panelde eşleşmemiş; stoktan düşülmez</div>`
      : state.settings && state.settings.stock_sync ? html`<div class="row small" style="color:var(--good)"><i class="ico ico-check"></i>Stok tüm kanallarda güncellendi</div>`
        : html`<div class="row small muted"><i class="ico ico-db"></i>Stok senkronu kapalı</div>`;
    const open = pk.filter((p) => p.status === 'open');
    if (mode === 'panel') {
      render(el, html`<div class="card-head" style="margin-bottom:4px"><h2>Sipariş #${o.order_number}</h2>${chBadge(o.channel)}</div>
        ${stepper(o.status)}
        <div class="small muted" style="margin-bottom:10px">${qty} ürün • ${pk.length} paket · ${o.customer}</div>
        <div class="stack" style="--g:8px">${pk.map((p) => pkgCard(o, p, pk.length))}</div>
        <div class="row" style="margin-top:14px">
          ${o.status === 'new' ? html`<button class="btn outline" style="flex:1" data-op="accept"><i class="ico ico-play"></i>İşleme al</button>`
            : html`<button class="btn outline" style="flex:1" data-op="split" ${splittable ? '' : 'disabled'}><i class="ico ico-split"></i>Pakete böl</button>`}
          <button class="btn primary" style="flex:1" data-op="ship" data-id="${open.length === 1 ? open[0].id : ''}" ${open.length && live() ? '' : 'disabled'}><i class="ico ico-truck"></i>Kargoya ver</button>
        </div>
        <button class="btn ghost sm block" style="margin-top:6px" data-op="detail">Sipariş detayı</button>`);
      return;
    }
    render(el, html`<div class="expand-grid">
      <div class="ops">
        <h3>Sipariş işlemleri</h3>
        ${stepper(o.status)}
        ${live() ? html`<div class="row wrap">
          ${o.status === 'new' ? html`<button class="btn primary" style="flex:1" data-op="accept"><i class="ico ico-play"></i>İşleme al</button>` : ''}
          <button class="btn outline" style="flex:1" data-op="split" ${splittable ? '' : 'disabled'}><i class="ico ico-split"></i>Pakete böl</button>
          <button class="btn outline" style="flex:1" data-op="addpkg" ${splittable ? '' : 'disabled'}><i class="ico ico-plus"></i>Paket ekle</button>
        </div>` : ''}
        <div style="margin-top:12px">${stockNote}</div>
        ${c.split === 'remote-async' && live() ? html`<div class="tiny muted" style="margin-top:8px">Trendyol'da bölünen paketler birkaç dakika sonra senkronla gelir.</div>` : ''}
        ${mode === 'sheet' ? '' : html`<button class="btn ghost sm" style="margin-top:8px" data-op="detail">Tüm detaylar →</button>`}
      </div>
      ${pk.map((p) => pkgCard(o, p, pk.length))}
    </div>`);
  }

  // ---------- işlemler ----------
  const pkgOf = (pid) => packagesOf(d.order).find((p) => String(p.id) === String(pid));
  async function getLabel(pkg, { refresh = false } = {}) {
    const r = await api(`orders/${enc}/label`, { method: 'POST', body: { package_id: pkg.virtual ? undefined : pkg.id, refresh } });
    d.order = r.order;
    return r;
  }
  function printPanel(order, pkgId, sender) {
    const pkg = order.packages.find((p) => p.id === pkgId) || order.packages[0];
    printLabels([{ order, pkg }], sender || (state.settings && state.settings.sender));
  }
  function openOfficial(off, win) {
    if (off.format === 'pdf') {
      const blob = new Blob([Uint8Array.from(atob(off.data), (c) => c.charCodeAt(0))], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (win) win.location = url; else downloadFile(off.filename, off.data, 'application/pdf');
      return;
    }
    if (win) win.close();
    downloadFile(off.filename, off.data, 'text/plain');
    toast('ZPL etiket indirildi (termal yazıcı). Normal yazıcı için Ayarlar → "ZPL etiketini PDF\'e çevir" açılabilir.');
  }

  const ops = {
    accept: (b) => busy(b, async () => { const r = await api(`orders/${enc}/accept`, { method: 'POST', body: {} }); toast(r.message); await changed(); }),
    split: () => splitEditor(d, 0, changed),
    addpkg: () => splitEditor(d, 1, changed),
    detail: () => openOrder(id, onChange),
    label: (b) => busy(b, async () => {
      const pkg = pkgOf(b.dataset.id);
      const r = await getLabel(pkg);
      if (r.official) toast(`${ch(d.order.channel).name} etiketi hazır`);
      else if (r.error) toast(r.error, true);
      else if (r.panel) { toast('Kanal barkodu alındı, etiket yazdırılıyor'); printPanel(r.order, r.package_id, r.sender); }
      draw(); onChange && onChange();
    }),
    print: (b) => {
      const pkg = pkgOf(b.dataset.id);
      // PDF etiket yeni sekmede açılır; sekme tıklama anında açılmalı (tarayıcı engellemesin)
      const win = caps().label && pkg.label_format === 'pdf' ? window.open('', '_blank') : null;
      busy(b, async () => {
        const r = await getLabel(pkg);
        if (r.official) openOfficial(r.official, win);
        else { if (win) win.close(); if (r.error && !r.panel) toast(r.error, true); printPanel(r.order, r.package_id, r.sender); }
        draw();
      });
    },
    ship: (b) => shipDialog(d, b.dataset.id ? pkgOf(b.dataset.id) : null, changed),
    more: (b) => {
      const pkg = pkgOf(b.dataset.id);
      const items = [
        { icon: 'truck', label: 'Kargo / takip no düzenle', run: () => shipDialog(d, pkg, changed, { editOnly: true }) },
        { icon: 'print', label: 'Panel etiketi yazdır (A6)', run: async () => { const r = pkg.virtual ? await getLabel(pkg) : { order: d.order, package_id: pkg.id }; printPanel(r.order, r.package_id); } },
      ];
      if (caps().label) items.push({ icon: 'sync', label: 'Kanal etiketini yeniden al', run: () => busy(null, async () => { const r = await getLabel(pkg, { refresh: true }); toast(r.official ? 'Etiket yenilendi' : r.error || 'Etiket alınamadı', !r.official); draw(); }) });
      if (pkg.has_label) items.push({ icon: 'download', label: 'Etiket dosyasını indir', run: () => busy(null, async () => { const r = await getLabel(pkg); if (r.official) downloadFile(r.official.filename, r.official.data, r.official.format === 'pdf' ? 'application/pdf' : 'text/plain'); }) });
      items.push('-', { icon: 'orders', label: 'Sipariş detayı', run: () => openOrder(id, onChange) });
      popMenu(b, items);
    },
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-op]');
    if (!b || !el.contains(b) || b.disabled) return;
    e.preventDefault(); e.stopPropagation();
    ops[b.dataset.op] && ops[b.dataset.op](b, e);
  });
  render(el, html`<div class="empty"><i class="ico ico-sync spin"></i></div>`);
  load().catch((e) => render(el, html`<div class="notice bad">${e.message}</div>`));
  return { reload: load };
}

// ---------- kargoya ver ----------
function shipDialog(d, pkg, done, { editOnly = false } = {}) {
  const o = d.order, open = packagesOf(o).filter((p) => p.status === 'open');
  if (!pkg && open.length > 1) return toast('Birden fazla paket var: her paketi kendi kartındaki “Kargoya ver” ile gönderin');
  pkg = pkg || open[0];
  if (!pkg) return toast('Gönderilecek açık paket yok');
  const companies = (state.settings && state.settings.cargo_companies) || [];
  const s = sheet({
    title: editOnly ? `Paket ${pkg.no} kargo bilgisi` : `Paket ${pkg.no} kargoya ver`, size: 'narrow',
    body: html`<div class="stack">
      <div class="small muted">${ch(o.channel).name} · #${o.order_number} · ${o.customer}</div>
      <label class="field"><span>Kargo firması</span><input class="input" list="cargo-dl" data-f="cargo" value="${pkg.cargo_company || o.cargo_company || ''}"><datalist id="cargo-dl">${companies.map((c) => html`<option value="${c}">`)}</datalist></label>
      <label class="field"><span>Takip / barkod no</span><input class="input" data-f="tracking" value="${pkg.tracking || pkg.barcode || ''}" placeholder="kanaldan geldiyse otomatik dolar"></label>
      ${o.channel === 'trendyol' && !editOnly ? html`<label class="field"><span>Fatura no (isteğe bağlı)</span><input class="input" data-f="invoice"></label>` : ''}
      <label class="field"><span>Desi</span><input class="input" inputmode="decimal" data-f="desi" value="${pkg.desi || ''}"></label>
      ${!editOnly && (d.channel || {}).caps && d.channel.caps.ship === 'remote' ? html`<div class="notice small">Gönderim bilgisi ${ch(o.channel).name}'a da bildirilir.</div>` : ''}
    </div>`,
    foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>${editOnly ? 'Kaydet' : html`<i class="ico ico-truck"></i>Kargoya ver`}</button>`,
  });
  const f = (k) => { const x = $(`[data-f=${k}]`, s.el); return x ? x.value.trim() : ''; };
  $('[data-save]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
    const enc = encodeURIComponent(o.id);
    if (editOnly) {
      if (pkg.virtual) return toast('Önce paket oluşturun (etiket oluştur)', true);
      await api(`orders/${enc}/tracking`, { method: 'POST', body: { package_id: pkg.id, tracking: f('tracking'), cargo_company: f('cargo'), desi: f('desi') } });
      toast('Kaydedildi');
    } else {
      const r = await api(`orders/${enc}/ship`, { method: 'POST', body: { package_id: pkg.virtual ? undefined : pkg.id, tracking: f('tracking'), cargo_company: f('cargo'), invoice_number: f('invoice') } });
      toast(r.message);
    }
    s.close(); await done();
  });
}

// ---------- paketlere böl / paket ekle ----------
function splitEditor(d, extra, done) {
  const o = d.order, live = o.items.filter((i) => i.status !== 'cancelled');
  if (o.packages.some((p) => p.status === 'shipped')) return toast('Kargoya verilmiş paketi olan sipariş yeniden bölünemez', true);
  let count = Math.min(8, Math.max(2, o.packages.length + extra));
  const grid = new Map(live.map((i) => [String(i.line_id), Array(8).fill(0)]));
  if (o.packages.length) o.packages.forEach((p, k) => p.items.forEach((x) => { const g = grid.get(String(x.line_id)); if (g) g[k] = x.qty; }));
  else live.forEach((i, k) => { grid.get(String(i.line_id))[live.length > 1 && k === live.length - 1 ? 1 : 0] = i.quantity; });
  const desi = Array(8).fill('');
  const s = sheet({ title: `Sipariş #${o.order_number} · paketler`, size: 'wide' });
  const draw = () => {
    s.setBody(html`<div class="stack">
      <p class="muted small" style="margin:0">Her ürünün adedini paketlere dağıtın. Her paket için ayrı kargo etiketi oluşur.${d.channel && d.channel.caps.split === 'remote' ? ` Paketler ${ch(o.channel).name}'da da oluşturulur.` : d.channel && d.channel.caps.split === 'remote-async' ? ' Bölme Trendyol\'a gönderilir; yeni paketler birkaç dakika sonra senkronla gelir.' : ''}</p>
      <div class="card flush"><div class="table-wrap"><table class="t"><thead><tr><th>Ürün</th>${Array.from({ length: count }, (_, k) => html`<th class="c">Paket ${k + 1}</th>`)}<th class="c">Kalan</th></tr></thead><tbody>
        ${live.map((i) => { const g = grid.get(String(i.line_id)); const left = i.quantity - g.slice(0, count).reduce((a, b) => a + b, 0); return html`<tr>
          <td style="min-width:180px"><div class="row">${thumb(i.product_image || i.image, i.name, 'sm')}<div style="min-width:0"><div class="ellipsis" style="max-width:260px;font-weight:600">${i.product_name || i.name}</div><div class="muted tiny">${i.quantity} adet</div></div></div></td>
          ${Array.from({ length: count }, (_, k) => html`<td class="c"><input class="input" style="width:70px;text-align:center" type="number" min="0" max="${i.quantity}" inputmode="numeric" data-cell="${i.line_id}:${k}" value="${g[k]}"></td>`)}
          <td class="c num" style="font-weight:800;color:${left ? 'var(--bad)' : 'var(--good)'}" data-left="${i.line_id}">${left}</td></tr>`; })}
        <tr><td class="muted small">Desi (isteğe bağlı)</td>${Array.from({ length: count }, (_, k) => html`<td class="c"><input class="input" style="width:70px;text-align:center" inputmode="decimal" data-desi="${k}" value="${desi[k]}"></td>`)}<td></td></tr>
      </tbody></table></div></div>
      <div class="row"><button class="btn sm" data-ed="add" ${count >= 8 ? 'disabled' : ''}><i class="ico ico-plus"></i>Paket ekle</button><button class="btn sm" data-ed="del" ${count <= 1 ? 'disabled' : ''}><i class="ico ico-minus"></i>Paket çıkar</button></div>
    </div>`);
  };
  s.setFoot(html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-ed="save"><i class="ico ico-split"></i>Paketleri oluştur</button>`);
  draw();
  // Adet değişince sadece "Kalan" hücresi güncellenir (tabloyu yeniden çizmek odaklı kutuyu bozar)
  s.el.addEventListener('input', (e) => {
    const c = e.target.dataset.cell;
    if (c) {
      const [lid, k] = c.split(':');
      grid.get(lid)[Number(k)] = Math.max(0, Math.round(numIn(e.target.value)));
      const it = live.find((i) => String(i.line_id) === lid), cell = $(`[data-left="${CSS.escape(lid)}"]`, s.el);
      const left = it.quantity - grid.get(lid).slice(0, count).reduce((a, b) => a + b, 0);
      if (cell) { cell.textContent = left; cell.style.color = left ? 'var(--bad)' : 'var(--good)'; }
    }
    if (e.target.dataset.desi) desi[Number(e.target.dataset.desi)] = e.target.value;
  });
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ed]');
    if (!b) return;
    if (b.dataset.ed === 'add') { count++; draw(); }
    if (b.dataset.ed === 'del') { for (const g of grid.values()) { g[count - 2] += g[count - 1]; g[count - 1] = 0; } count--; draw(); }
    if (b.dataset.ed === 'save') {
      const bad = live.find((i) => grid.get(String(i.line_id)).slice(0, count).reduce((a, x) => a + x, 0) !== i.quantity);
      if (bad) return toast(`“${bad.product_name || bad.name}” adetleri tam dağıtılmadı`, true);
      const groups = Array.from({ length: count }, (_, k) => ({ desi: numIn(desi[k]) || null, items: live.map((i) => ({ line_id: String(i.line_id), qty: grid.get(String(i.line_id))[k] })).filter((x) => x.qty > 0) })).filter((g) => g.items.length);
      busy(b, async () => { const r = await api(`orders/${encodeURIComponent(o.id)}/split`, { method: 'POST', body: { groups } }); toast(r.message); s.close(); await done(); });
    }
  });
}

// ---------- sipariş detayı (tam) ----------
export async function openOrder(id, onChange) {
  const s = sheet({ title: 'Sipariş', size: 'wide drawer' });
  s.setBody(html`<div class="empty"><i class="ico ico-sync spin"></i></div>`);
  let d;
  const load = async () => {
    d = await api('orders/' + encodeURIComponent(id));
    const o = d.order, p = d.profit, a = o.address || {};
    s.title.textContent = `#${o.order_number} · ${ch(o.channel).name}`;
    s.setBody(html`
      <div class="row wrap" style="margin-bottom:12px">${chLogo(o.channel)}${statusPill(o.status)}<span class="muted small">${dateTime(o.ordered_at)}</span>
        ${o.remote_status ? html`<span class="muted tiny" title="Kanaldaki durum">(${o.remote_status})</span>` : ''}${o.extra && o.extra.awaitingPayment ? html`<span class="pill warn">Ödeme bekleniyor</span>` : ''}</div>
      <div data-ops></div>
      <div class="two-col" style="margin-top:16px">
        <div class="card">
          <div class="card-head"><h3>Ürünler</h3><span class="muted small">${o.items.filter((i) => i.status !== 'cancelled').reduce((t, i) => t + i.quantity, 0)} adet</span></div>
          ${o.items.map((i) => html`<div class="li" style="${i.status === 'cancelled' ? 'opacity:.5' : ''}">${thumb(i.product_image || i.image, i.name)}
            <div style="min-width:0;flex:1"><div class="ellipsis" style="font-weight:650">${i.product_name || i.name}</div>
              <div class="muted small">${[i.sku, i.barcode].filter(Boolean).join(' · ')}${i.status === 'cancelled' ? ' · İptal' : ''}</div>
              ${i.product_id ? html`<div class="tiny muted">Ortak stok: <b>${i.product_stock}</b></div>` : html`<div class="tiny" style="color:var(--amber)">Panelde eşleşmemiş — <a class="link" href="#/eslestirme">eşleştir</a></div>`}</div>
            <div style="text-align:right" class="num"><div><b>${i.quantity}</b> × ${money(i.unit_price)}</div><div class="muted small">${money(i.total)}</div></div></div>`)}
        </div>
        <div class="stack">
          <div class="card">
            <div class="card-head"><h3>Alıcı</h3><button class="btn sm ghost" data-copy><i class="ico ico-copy"></i>Kopyala</button></div>
            <div style="font-weight:700">${a.name || o.customer}</div><div class="small">${a.line}</div><div class="small">${[a.district, a.city].filter(Boolean).join(' / ')}</div><div class="small muted">${a.phone || o.phone}${o.email ? ` · ${o.email}` : ''}</div>
          </div>
          <div class="card">
            <div class="card-head"><h3>Kârlılık (tahmini)</h3></div>
            <dl class="kv"><dt>Satış</dt><dd>${money(p.revenue)}</dd><dt>Komisyon</dt><dd>−${money(p.commission)}</dd><dt>Kargo</dt><dd>−${money(p.shipping)}</dd>
              ${p.fee ? html`<dt>Hizmet bedeli</dt><dd>−${money(p.fee)}</dd>` : ''}<dt style="color:var(--text);font-weight:650">Satıştan kalan</dt><dd style="font-weight:650">${money(p.payout)}</dd>
              <dt>Ürün maliyeti</dt><dd>−${money(p.cost)}</dd><div class="total"><dt>Kâr</dt><dd class="${p.profit >= 0 ? 'up' : 'down'}">${money(p.profit)}</dd></div></dl>
            ${p.missingCost ? html`<div class="notice warn small" style="margin-top:10px">${p.missingCost} ürünün alış fiyatı girilmemiş; kâr olduğundan yüksek görünür.</div>` : ''}
          </div>
          <div class="card stack">
            <h3>Not ve ayarlar</h3>
            <label class="field"><span>Sipariş notu</span><textarea class="input" data-note>${o.note || ''}</textarea></label>
            <label class="field"><span>Bu siparişin kargo gideri (boş = varsayılan)</span><div class="input-group"><input class="input" inputmode="decimal" data-shipcost value="${o.shipping_cost ?? ''}"><span class="suffix">₺</span></div></label>
            <div class="row wrap"><button class="btn sm" data-save-note>Kaydet</button><span class="spacer"></span>
              <select class="input" style="width:auto;min-height:34px;font-size:13px" data-status aria-label="Durumu elle değiştir"><option value="">Durumu elle değiştir…</option>${Object.entries(STATUS_LABEL).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></div>
          </div>
        </div>
      </div>`);
    mountOps($('[data-ops]', s.body), id, { mode: 'sheet', onChange: async () => { onChange && onChange(); } });
  };
  s.body.addEventListener('click', (e) => {
    if (e.target.closest('[data-copy]')) {
      const o = d.order, a = o.address || {};
      navigator.clipboard.writeText([a.name || o.customer, a.line, [a.district, a.city].filter(Boolean).join(' / '), a.phone || o.phone].filter(Boolean).join('\n')).then(() => toast('Adres kopyalandı'), () => toast('Kopyalanamadı', true));
    }
    const sv = e.target.closest('[data-save-note]');
    if (sv) busy(sv, async () => { await api(`orders/${encodeURIComponent(id)}/note`, { method: 'POST', body: { note: $('[data-note]', s.body).value, shipping_cost: $('[data-shipcost]', s.body).value } }); toast('Kaydedildi'); });
  });
  s.body.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-status]') || !e.target.value) return;
    const v = e.target.value;
    if (!(await confirmBox(`Sipariş durumu elle “${STATUS_LABEL[v]}” yapılsın mı? (Sadece panelde değişir; iptalde ürünler stoğa geri eklenir.)`, 'Değiştir'))) { e.target.value = ''; return; }
    try { await api(`orders/${encodeURIComponent(id)}/status`, { method: 'POST', body: { status: v } }); toast('Durum güncellendi'); await load(); onChange && onChange(); } catch (err) { toast(err.message, true); }
  });
  await load().catch((e) => s.setBody(html`<div class="notice bad">${e.message}</div>`));
}

// Toplu etiket: seçilen siparişlerin kanal etiketleri alınır; PDF'ler indirilir, diğerleri panel etiketi olarak yazdırılır
export async function bulkLabels(ids, { fetch = true } = {}) {
  const r = await api('labels', { method: 'POST', body: { ids, fetch } });
  const panel = [], files = [];
  for (const { order, labels } of r.orders) {
    for (const l of labels) {
      const pkg = order.packages.find((p) => p.id === l.package_id);
      if (l.official) files.push(l.official); else if (pkg) panel.push({ order, pkg });
    }
  }
  for (const f of files) downloadFile(f.filename, f.data, f.format === 'pdf' ? 'application/pdf' : 'text/plain');
  if (panel.length) printLabels(panel, r.sender);
  if (r.errors.length) toast(r.errors.slice(0, 3).join(' · ') + (r.errors.length > 3 ? ` (+${r.errors.length - 3})` : ''), true);
  else toast(`${files.length + panel.length} etiket hazırlandı${files.length ? ` (${files.length} kanal etiketi indirildi)` : ''}`);
  return r;
}
export { n, shortDT };

// Kargo sayfası için tek paket işlemi: 'label' (kanal etiketi oluştur/al ve yazdır) | 'ship' (kargoya ver)
export async function packageAction(kind, orderId, pkgId, done) {
  const d = await api('orders/' + encodeURIComponent(orderId));
  const pkg = packagesOf(d.order).find((p) => (pkgId ? p.id === pkgId : true));
  if (kind === 'ship') return shipDialog(d, pkg, done);
  const r = await api(`orders/${encodeURIComponent(orderId)}/label`, { method: 'POST', body: { package_id: pkgId || undefined } });
  if (r.official) downloadFile(r.official.filename, r.official.data, r.official.format === 'pdf' ? 'application/pdf' : 'text/plain');
  else {
    if (r.error && !r.panel) toast(r.error, true);
    const p = r.order.packages.find((x) => x.id === r.package_id) || r.order.packages[0];
    if (p && (r.panel || p.barcode || p.tracking)) printLabels([{ order: r.order, pkg: p }], r.sender);
  }
  done && done();
}
