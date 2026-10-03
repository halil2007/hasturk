// Sipariş işlemleri (ortak bileşen): işleme al → paketle (kanalda kargoya hazırla) → kargo firması seç/değiştir →
// etiket oluştur → yazdır (onaylı) → kargoya ver. Her paket ayrı izlenir. Siparişler tablosu, Genel Bakış, Kargo sayfası kullanır.
import { api, state, html, render, $, $$, money, n, ch, chLogo, chBadge, statusPill, STATUS_LABEL, thumb, toast, busy, sheet, confirmBox, popMenu, dateTime, shortDT, lateInfo, extNote } from '../core.js';
import { printLabels, printImages, downloadFile } from '../labels.js';
import { diagnoseDialog } from './diagnose.js';

const STEPS = [['new', 'Yeni'], ['processing', 'Hazırlanıyor'], ['shipped', 'Kargoda']];
export function stepper(status) {
  if (status === 'cancelled' || status === 'returned') return html`<div class="notice bad" style="margin:12px 0">${statusPill(status)}<span>Bu sipariş ${status === 'cancelled' ? 'iptal edildi' : 'iade sürecinde / iade edildi'}; kargo işlemi yapılamaz.</span></div>`;
  const cur = status === 'delivered' ? 3 : STEPS.findIndex(([k]) => k === status);
  return html`<div class="stepper">${STEPS.map(([, t], i) => html`<div class="st ${i < cur ? 'done' : i === cur ? 'cur' : ''}"><span class="b">${i < cur ? html`<i class="ico ico-check"></i>` : ''}</span>${t}</div>`)}${status === 'delivered' ? html`<div class="st done"><span class="b"><i class="ico ico-check"></i></span>Teslim</div>` : ''}</div>`;
}

const lineOf = (o, lid) => o.items.find((i) => String(i.line_id) === String(lid)) || {};
// Etiket var mı: kanal etiketi / geçerli panel etiketi. Etiket servisi olan kanalda (ikas Kargo, Trendyol, Hepsiburada)
// yalnızca barkod gelmiş olması etiket sayılmaz; kendi anlaşmanızla gönderimde ve etiket servisi olmayan kanalda sayılır.
const hasLabel = (p, chId) => !!(p.has_label || p.label_at || ((p.barcode || p.tracking) && (p.agreement === 'own' || p.virtual || (ch(chId || p.channel).caps || {}).label !== 'remote')));
// Paket durumu: paketlenmedi → kargoya hazır (etiket bekleniyor) → etiket hazır → yazdırıldı → kargoda
export function labelState(o, pkg) {
  const c = o.channel || pkg.channel;
  if (pkg.status === 'shipped') return { key: 'shipped', text: 'Kargoda', cls: 'shipped' };
  if (pkg.error) return { key: 'error', text: 'Kanal hatası', cls: 'bad' };
  if (pkg.label_printed_at) return { key: 'printed', text: 'Etiket yazdırıldı', cls: 'good' };
  if (hasLabel(pkg, c)) return { key: 'ready', text: 'Etiket hazır', cls: 'info' };
  if (pkg.packed_at && (pkg.barcode || pkg.tracking)) return { key: 'created', text: 'Gönderi oluştu · etiket bekleniyor', cls: 'amber' };
  if (pkg.packed_at) return { key: 'packed', text: c && /^ikas/.test(c) ? 'ikas Kargo bekleniyor' : 'Kargoya hazır', cls: 'amber' };
  return { key: 'unpacked', text: 'Paketlenmedi', cls: 'warn' };
}

// Siparişin paketleri; hiç paket yoksa tüm sipariş tek "taslak" paket olarak gösterilir
function packagesOf(o) {
  if (o.packages.length) return o.packages;
  const items = o.items.filter((i) => i.status !== 'cancelled').map((i) => ({ line_id: i.line_id, qty: i.quantity }));
  return [{ id: 0, no: 1, items, status: ['shipped', 'delivered'].includes(o.status) ? 'shipped' : 'open', tracking: o.tracking, cargo_company: o.cargo_company, virtual: true }];
}

// ---------- etiket çıktısı + yazdırma onayı ----------
// Tarayıcı yazdırmanın gerçekten yapıldığını bildirmez: yazdırma penceresinden sonra kullanıcıya sorulur
async function mark(orderId, pkgIds, kind) {
  for (const id of pkgIds) await api(`orders/${encodeURIComponent(orderId)}/label-mark`, { method: 'POST', body: { package_id: id, kind } }).catch(() => {});
}
export function askPrinted(items, done) {
  // items: [{ orderId, pkgId }]
  if (!items.length) return;
  const s = sheet({
    title: 'Etiket yazdırıldı mı?', size: 'narrow',
    body: html`<p style="margin:0">${items.length > 1 ? `${items.length} etiket` : 'Etiket'} yazdırıcıya gönderildi. Yazdırma başarılıysa onaylayın; sipariş listesinde “Etiket yazdırıldı” olarak görünür.</p>`,
    foot: html`<button class="btn" data-no>Yazdırılmadı</button><span class="spacer"></span><button class="btn primary" data-yes><i class="ico ico-check"></i>Evet, yazdırıldı</button>`,
  });
  $('[data-no]', s.el).onclick = () => s.close();
  $('[data-yes]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
    const by = new Map();
    for (const x of items) by.set(x.orderId, [...(by.get(x.orderId) || []), x.pkgId]);
    for (const [oid, ids] of by) await mark(oid, ids, 'printed');
    s.close(); toast('Etiket yazdırıldı olarak işaretlendi'); done && done();
  });
}
// Kanal etiketi (PDF / PNG / ZPL) ya da panel etiketi (kanal barkodu ile) çıktısı; sonra yazdırma onayı
export async function outputLabel(r, { win, ask = true, done } = {}) {
  const order = r.order, pkg = order.packages.find((p) => p.id === r.package_id) || order.packages[0];
  const off = r.official;
  if (off && off.format === 'pdf') {
    const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(off.data), (c) => c.charCodeAt(0))], { type: 'application/pdf' }));
    if (win) win.location = url; else window.open(url, '_blank') || downloadFile(off.filename, off.data, 'application/pdf');
  } else {
    if (win) win.close();
    if (off && off.format === 'zpl') { downloadFile(off.filename, off.data, 'text/plain'); toast('ZPL etiket indirildi (termal yazıcı). Normal yazıcı için Ayarlar → "ZPL etiketini PDF\'e çevir".'); }
    else if (off) await printImages([off]);
    else await printLabels([{ order, pkg }], r.sender || (state.settings && state.settings.sender));
  }
  await mark(order.id, [pkg.id], 'viewed');
  if (ask) askPrinted([{ orderId: order.id, pkgId: pkg.id }], done);
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
  const chName = () => ch(d.order.channel).name;

  // Paketin sıradaki adımı tek düğme
  function mainBtn(o, p) {
    if (p.status === 'shipped' || !live()) return hasLabel(p, o.channel) ? html`<button class="btn sm outline" data-op="print" data-id="${p.id}"><i class="ico ico-print"></i>Etiketi göster</button>` : '';
    const ls = labelState(o, p);
    if (ls.key === 'unpacked') return html`<button class="btn sm primary" data-op="label" data-id="${p.id}"><i class="ico ico-box"></i>${caps().pack ? 'Paketle ve etiket al' : 'Etiket oluştur'}</button>`;
    if (ls.key === 'packed' || ls.key === 'created' || ls.key === 'error') return html`<button class="btn sm primary" data-op="label" data-id="${p.id}"><i class="ico ico-tag"></i>${ls.key === 'error' ? 'Tekrar dene' : ls.key === 'created' ? 'Etiketi al' : 'Etiket oluştur'}</button>`;
    if (ls.key === 'ready') return html`<button class="btn sm primary" data-op="print" data-id="${p.id}"><i class="ico ico-print"></i>Etiketi yazdır</button>`;
    return html`<button class="btn sm" data-op="print" data-id="${p.id}"><i class="ico ico-print"></i>Tekrar yazdır</button><button class="btn sm primary" data-op="ship" data-id="${p.id}"><i class="ico ico-truck"></i>${caps().ship === 'remote' ? 'Kargoya ver' : 'Kargoya verildi'}</button>`;
  }
  function labelSteps(p) {
    const st = [['packed_at', 'Paketlendi'], ['label_at', 'Etiket oluşturuldu'], ['label_viewed_at', 'Görüntülendi'], ['label_printed_at', 'Yazdırıldı']];
    const at = { ...p, label_at: p.label_at || (hasLabel(p, d.order.channel) ? 1 : null) };
    return html`<div class="lbl-st">${st.map(([k, t]) => html`<span class="${at[k] ? 'on' : ''}" title="${at[k] > 1 ? dateTime(at[k]) : ''}">${at[k] ? '✓ ' : ''}${t}${k === 'label_printed_at' && p.label_prints > 1 ? ` (${p.label_prints})` : ''}</span>`)}</div>`;
  }

  function pkgCard(o, p) {
    const ls = labelState(o, p);
    const qty = p.items.reduce((a, x) => a + x.qty, 0);
    const canCargo = live() && p.status === 'open' && caps().cargo && !p.virtual;
    return html`<div class="pkg-card" data-pkg="${p.id}">
      <div class="hd"><span class="box"><i class="ico ico-box"></i></span><b>Paket ${p.no}</b><span class="muted small">• ${qty} ürün</span><span class="spacer"></span><span class="pill ${ls.cls}">${ls.text}</span></div>
      ${mode === 'panel' ? html`<div class="small muted ellipsis">${p.items.map((x) => `${lineOf(o, x.line_id).product_name || lineOf(o, x.line_id).name} ×${x.qty}`).join(', ')}</div>`
        : p.items.map((x) => { const it = lineOf(o, x.line_id); return html`<div class="line">${thumb(it.product_image || it.image, it.name, 'sm')}<div style="min-width:0"><div class="ellipsis" style="font-weight:600">${it.product_name || it.name}</div><div class="muted tiny">${it.sku || ''}</div></div><span class="spacer"></span><b>×${x.qty}</b></div>`; })}
      <div class="cargo-row"><i class="ico ico-truck muted"></i><span class="ellipsis" style="flex:1"><b>${p.cargo_company || o.cargo_company || (caps().cargo === 'pack' ? 'ikas Kargo (öncelik sırasına göre)' : 'Kanalın kargosu')}</b>${p.barcode || p.tracking ? html` · <span class="num">${p.barcode || p.tracking}</span>` : ''}</span>
        ${canCargo ? html`<button class="btn sm ghost" data-op="cargo" data-id="${p.id}">${p.cargo_company ? 'Değiştir' : 'Seç'}</button>` : ''}</div>
      ${mode !== 'panel' && !p.virtual ? labelSteps(p) : ''}
      ${p.error ? html`<div class="err"><b>${chName()}:</b> ${p.error} <button class="btn sm ghost" data-op="diag">Tanıla</button></div>` : ''}
      <div class="acts">${mainBtn(o, p)}${mode !== 'panel' && !p.virtual ? html`<button class="btn sm" style="flex:0 0 auto" data-op="more" data-id="${p.id}" aria-label="Diğer işlemler"><i class="ico ico-dots"></i></button>` : ''}</div>
    </div>`;
  }

  function draw() {
    const o = d.order, pk = packagesOf(o), c = caps();
    const qty = o.items.filter((i) => i.status !== 'cancelled').reduce((a, i) => a + i.quantity, 0);
    const splittable = live() && o.status !== 'shipped' && !pk.some((p) => p.status === 'shipped') && (o.items.filter((i) => i.status !== 'cancelled').length > 1 || qty > 1);
    const unmatched = o.items.filter((i) => !i.product_id).length;
    const late = lateInfo({ ...o, packages: o.packages.length, open_packages: o.packages.filter((p) => p.status === 'open').length });
    const ext = extNote(o);
    const notes = html`${late ? html`<div class="notice ${late.cls === 'bad' ? 'bad' : 'warn'} small"><i class="ico ico-warn"></i><div><b>${late.text}</b> · ${late.title}</div></div>` : ''}
      ${ext ? html`<div class="notice small" style="background:var(--purple-soft)"><i class="ico ico-bell"></i><div><b>${ext.text}</b> · ${shortDT(ext.at)} <span class="muted">(${ext.detail})</span></div></div>` : ''}`;
    const stockNote = unmatched
      ? html`<div class="row small" style="color:var(--amber)"><i class="ico ico-warn"></i>${unmatched} ürün panelde eşleşmemiş; stoktan düşülmez</div>`
      : state.settings && state.settings.stock_sync ? html`<div class="row small" style="color:var(--good)"><i class="ico ico-check"></i>Stok tüm kanallarda güncellendi</div>`
        : html`<div class="row small muted"><i class="ico ico-db"></i>Stok senkronu kapalı</div>`;
    const open = pk.filter((p) => p.status === 'open');
    if (mode === 'panel') {
      render(el, html`<div class="card-head" style="margin-bottom:4px"><h2>Sipariş #${o.order_number}</h2>${chBadge(o.channel)}</div>
        ${stepper(o.status)}${notes}
        <div class="small muted" style="margin:6px 0 10px">${qty} ürün • ${pk.length} paket · ${o.customer}</div>
        <div class="stack" style="--g:8px">${pk.map((p) => pkgCard(o, p))}</div>
        <div class="row" style="margin-top:14px">
          ${o.status === 'new' ? html`<button class="btn outline" style="flex:1" data-op="accept"><i class="ico ico-play"></i>İşleme al</button>` : ''}
          <button class="btn outline" style="flex:1" data-op="split" ${splittable ? '' : 'disabled'}><i class="ico ico-split"></i>Pakete böl</button>
        </div>
        <button class="btn ghost sm block" style="margin-top:6px" data-op="detail">Sipariş detayı</button>`);
      return;
    }
    render(el, html`<div class="expand-grid">
      <div class="ops">
        <h3>Sipariş işlemleri</h3>
        ${stepper(o.status)}${notes}
        ${live() ? html`<div class="row wrap" style="margin-top:8px">
          ${o.status === 'new' ? html`<button class="btn primary" style="flex:1" data-op="accept"><i class="ico ico-play"></i>İşleme al</button>` : ''}
          ${open.length > 1 && open.some((p) => !hasLabel(p, d.order.channel)) ? html`<button class="btn primary" style="flex:1" data-op="labels"><i class="ico ico-tag"></i>Tüm etiketleri al</button>` : ''}
          <button class="btn outline" style="flex:1" data-op="split" ${splittable ? '' : 'disabled'}><i class="ico ico-split"></i>Pakete böl</button>
          <button class="btn outline" style="flex:1" data-op="addpkg" ${splittable ? '' : 'disabled'}><i class="ico ico-plus"></i>Paket ekle</button>
        </div>` : ''}
        <div style="margin-top:12px">${stockNote}</div>
        ${c.split === 'remote-async' && live() ? html`<div class="tiny muted" style="margin-top:8px">Trendyol'da bölünen paketler birkaç dakika sonra senkronla gelir.</div>` : ''}
        ${c.pack && live() ? html`<div class="tiny muted" style="margin-top:8px">${packHelp(o.channel, c)}</div>` : ''}
        ${mode === 'sheet' ? '' : html`<button class="btn ghost sm" style="margin-top:8px" data-op="detail">Tüm detaylar →</button>`}
      </div>
      ${pk.map((p) => pkgCard(o, p))}
    </div>`);
  }

  // ---------- işlemler ----------
  const pkgOf = (pid) => packagesOf(d.order).find((p) => String(p.id) === String(pid));
  const getLabel = (pkg, extra = {}) => api(`orders/${enc}/label`, { method: 'POST', body: { package_id: pkg.virtual ? undefined : pkg.id, ...extra } });
  // Etiket al. ikas Kargo'da gönderi ve etiket "Kargoya Hazır"dan sonra oluşur: adımlar gösterilerek yaklaşık 1 dakika izlenir.
  // Gerçek gönderi / etiket oluşmadan işlem tamamlanmış sayılmaz.
  async function fetchLabel(pkg) {
    let r = await getLabel(pkg);
    if (!r.pending || !['waiting', 'created'].includes(r.step)) return r;
    let stop = false;
    const s = sheet({ title: `${chName()} · gönderi hazırlanıyor`, size: 'narrow', onClose: () => { stop = true; } });
    const row = (ok, text) => html`<div class="diag-row"><span class="diag-ic ${ok ? 'good' : 'amber'}">${ok ? '✓' : html`<i class="ico ico-sync spin"></i>`}</span><div style="flex:1">${text}</div></div>`;
    const draw = (x, i, n) => s.setBody(html`<div class="stack"><div class="diag">
      ${row(true, html`Paket ${chName()}'da <b>Kargoya Hazır</b> yapıldı`)}
      ${row(x.step === 'created' || !!x.official, x.step === 'created' || x.official ? 'ikas Kargo gönderiyi oluşturdu (gerçek kargo barkodu alındı)' : 'ikas Kargo anlaşmalı firmada gönderiyi oluşturuyor…')}
      ${row(!!x.official, x.official ? 'Kargo etiketi alındı' : 'Kargo etiketi bekleniyor…')}
    </div><div class="small muted">${x.pending || ''}</div><div class="tiny muted">Kontrol ${i} / ${n} · pencereyi kapatırsanız izleme durur, işlem ikas'ta sürer.</div></div>`);
    s.setFoot(html`<span class="spacer"></span><button class="btn" data-close>Arka planda bırak</button>`);
    const waits = [3, 4, 5, 6, 8, 10, 12, 15];
    for (let i = 0; i < waits.length && !stop; i++) {
      draw(r, i + 1, waits.length);
      await new Promise((ok) => setTimeout(ok, waits[i] * 1000));
      if (stop) break;
      r = await getLabel({ ...pkg, id: r.package_id, virtual: false });
      if (!r.pending || !['waiting', 'created'].includes(r.step)) break;
    }
    s.close();
    return r;
  }
  // Gerçek gönderi / etiket henüz yoksa: sebep + seçenekler (tanılama; gerçek kanal barkodu varsa kendi etiketimizle yazdırma)
  function notReady(r) {
    const pkg = d.order.packages.find((p) => p.id === r.package_id);
    const s = sheet({ title: `${chName()} · etiket henüz hazır değil`, size: 'narrow', body: html`<div class="stack">
      <div class="notice ${r.error ? 'bad' : 'warn'}"><i class="ico ico-warn"></i><div>${r.error || r.pending}</div></div>
      ${r.barcodeOnly && pkg && (pkg.barcode || pkg.tracking) ? html`<div class="small muted">Kanaldan gelen gerçek gönderi barkodu: <b class="num">${pkg.barcode || pkg.tracking}</b> (${pkg.cargo_company || 'kargo'}). Kanalın etiketi gelene kadar beklemeniz önerilir; kargo firması kabul ediyorsa bu barkodla kendi etiketimizi de yazdırabilirsiniz.</div>` : html`<div class="small muted">Gerçek gönderi oluşmadığı için etiket verilmedi. Senkronda durum otomatik güncellenir; “Etiket oluştur”a tekrar basarak kontrol edebilirsiniz.</div>`}
    </div>`,
    foot: html`<button class="btn" data-diag><i class="ico ico-bolt"></i>Tanılama</button><span class="spacer"></span>${r.barcodeOnly && pkg && (pkg.barcode || pkg.tracking) ? html`<button class="btn" data-own><i class="ico ico-print"></i>Barkodla kendi etiketimiz</button>` : ''}<button class="btn primary" data-close>Kapat</button>` });
    $('[data-diag]', s.el).onclick = () => { s.close(); diagnoseDialog(d.order.channel, d.order.id, d.order.order_number); };
    const own = $('[data-own]', s.el);
    if (own) own.onclick = async () => { s.close(); await printLabels([{ order: d.order, pkg }], state.settings && state.settings.sender); await mark(d.order.id, [pkg.id], 'viewed'); askPrinted([{ orderId: d.order.id, pkgId: pkg.id }], changed); };
  }
  const ops = {
    accept: (b) => busy(b, async () => { const r = await api(`orders/${enc}/accept`, { method: 'POST', body: {} }); toast(r.message); await changed(); }),
    split: () => splitEditor(d, 0, changed),
    addpkg: () => splitEditor(d, 1, changed),
    detail: () => openOrder(id, onChange),
    label: (b) => busy(b, async () => {
      const r = await fetchLabel(pkgOf(b.dataset.id));
      if (r.error || r.pending) { await changed(); notReady(r); return; }
      else { toast(r.official ? `${chName()} etiketi hazır` : `${chName()} barkodu alındı, etiket hazır`); await outputLabel(r, { done: changed }); }
      await changed();
    }),
    labels: (b) => busy(b, async () => { await bulkLabels([d.order.id], { fetch: true }); await changed(); }),
    print: (b) => {
      const pkg = pkgOf(b.dataset.id);
      // PDF etiket yeni sekmede açılır; sekme tıklama anında açılmalı (tarayıcı engellemesin)
      const win = pkg.label_format === 'pdf' ? window.open('', '_blank') : null;
      busy(b, async () => {
        const r = await getLabel(pkg);
        if ((r.error || r.pending) && !r.official && !r.panel) { if (win) win.close(); await changed(); notReady(r); return; }
        await outputLabel(r, { win, done: changed });
        await changed();
      });
    },
    ship: (b) => shipDialog(d, b.dataset.id ? pkgOf(b.dataset.id) : null, changed),
    cargo: (b) => cargoDialog(d, pkgOf(b.dataset.id), changed),
    diag: () => diagnoseDialog(d.order.channel, d.order.id, d.order.order_number),
    more: (b) => {
      const pkg = pkgOf(b.dataset.id), c = caps(), open = pkg.status === 'open' && live();
      const items = [];
      if (open && c.cargo) items.push({ icon: 'truck', label: 'Kargo firmasını değiştir', run: () => cargoDialog(d, pkg, changed) });
      if (hasLabel(pkg, d.order.channel) || pkg.barcode || pkg.tracking) {
        items.push({ icon: 'sync', label: 'Etiketi kanaldan yeniden al', run: () => busy(null, async () => { const r = await getLabel(pkg, { refresh: true }); toast(r.official || r.panel ? 'Etiket yenilendi' : r.error || r.pending || 'Etiket alınamadı', !(r.official || r.panel)); await changed(); }) });
        if (pkg.has_label) items.push({ icon: 'download', label: 'Etiket dosyasını indir', run: () => busy(null, async () => { const r = await getLabel(pkg); if (r.official) { downloadFile(r.official.filename, r.official.data, r.official.format === 'zpl' ? 'text/plain' : r.official.format === 'pdf' ? 'application/pdf' : 'image/' + r.official.format); await mark(d.order.id, [pkg.id], 'viewed'); } }) });
        items.push(pkg.label_printed_at
          ? { icon: 'x', label: 'Yazdırıldı işaretini kaldır', run: () => busy(null, async () => { await mark(d.order.id, [pkg.id], 'unprinted'); await changed(); }) }
          : { icon: 'check', label: 'Yazdırıldı olarak işaretle', run: () => busy(null, async () => { await mark(d.order.id, [pkg.id], 'printed'); toast('İşaretlendi'); await changed(); }) });
        items.push({ icon: 'print', label: 'Kendi etiketimizi yazdır (kanal barkoduyla)', run: async () => { await printLabels([{ order: d.order, pkg }], state.settings && state.settings.sender); await mark(d.order.id, [pkg.id], 'viewed'); askPrinted([{ orderId: d.order.id, pkgId: pkg.id }], changed); } });
      }
      if (open && pkg.packed_at && pkg.remote_id && c.cancelPackage) items.push('-', { icon: 'x', danger: true, label: 'Paketi iptal et (kanalda paketlemeyi geri al)', run: async () => {
        if (!(await confirmBox(`Paket ${pkg.no} ${chName()}'da iptal edilsin mi? Barkod/etiket geçersiz olur; paket yeniden paketlenebilir veya bölünebilir.`, 'Paketi iptal et'))) return;
        busy(null, async () => { const r = await api(`orders/${enc}/cancel-package`, { method: 'POST', body: { package_id: pkg.id } }); toast(r.message); await changed(); });
      } });
      if (open) items.push('-', { icon: 'key', label: 'Kendi anlaşmamla gönder (takip no gir)', run: () => shipDialog(d, pkg, changed, { editOnly: true }) });
      items.push('-', { icon: 'bolt', label: `Kargo / bağlantı tanılaması (${chName()})`, run: () => diagnoseDialog(d.order.channel, d.order.id, d.order.order_number) });
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

function packHelp(channel, c) {
  const name = ch(channel).name, t = ch(channel).type;
  if (t === 'ikas') return `“Paketle” ile paket ${name} (ikas) içinde “Kargoya Hazır” olur; ikas Kargo, seçilen firma ya da ikas panelindeki kargo önceliğine göre barkodu ve etiketi üretir.`;
  if (t === 'trendyol') return `“Paketle” Trendyol'a “Hazırlanıyor” bildirir. Kargo firması Trendyol'un anlaşmalı firmalarından seçilir/değiştirilir; Trendyol Express ve Aras'ta ortak etiket alınır.`;
  if (t === 'hepsiburada') return `“Paketle” paketi Hepsiburada'da oluşturur; kargo firması Hepsiburada'nın izin verdiği firmalar arasından değiştirilebilir ve etiket Hepsiburada'dan alınır.`;
  return c.pack ? `Paket ${name}'da hazırlanır ve etiket kanaldan alınır.` : '';
}

// ---------- kargo firması seç / değiştir (seçenekler kanaldan gelir) ----------
async function cargoDialog(d, pkg, done) {
  const o = d.order, enc = encodeURIComponent(o.id);
  if (!pkg || pkg.virtual) return toast('Önce paketleri oluşturun');
  const s = sheet({ title: `Paket ${pkg.no} · kargo firması`, size: 'narrow', body: html`<div class="empty"><i class="ico ico-sync spin"></i></div>` });
  let r;
  try { r = await api(`orders/${enc}/cargo-options?package_id=${pkg.id}`); } catch (e) { return s.setBody(html`<div class="notice bad">${e.message}</div>`); }
  if (!r.options.length) return s.setBody(html`<div class="notice">${r.note || 'Bu kanal için kargo firması seçeneği yok'}</div>`);
  const cur = r.code || '';
  const note = r.mode === 'pack' ? (pkg.packed_at ? 'Gönderi (barkod) oluşmadan önce firma değiştirilebilir: paket ikas\'ta iptal edilip seçilen firmayla yeniden “Kargoya Hazır” yapılır, ikas Kargo gönderiyi o firmada açar.' : 'Firma seçimi “Paketle ve etiket al” adımında ikas Kargo\'ya iletilir; ikas Kargo gerçek gönderiyi bu firmada açar ve etiketi verir. Liste, ikas kargo ayarlarınızdaki firmalardır.')
    : pkg.packed_at ? 'Değişiklik kanala gönderilir; yeni etiket oluşturmanız gerekir.' : 'Seçim paketlerken kanala uygulanır.';
  s.setBody(html`<div class="stack">
    <div class="small muted">${ch(o.channel).name} · #${o.order_number} · şu an: <b>${pkg.cargo_company || 'kanalın varsayılanı'}</b></div>
    <div class="stack" style="gap:6px">${r.options.map((c) => html`<label class="cand" style="cursor:pointer"><input type="radio" name="cargo" value="${c.id}" data-name="${c.name}" ${(cur ? cur === c.id : c.current) ? 'checked' : ''}><span style="flex:1"><span style="font-weight:600">${c.name}</span>${c.hint ? html`<div class="tiny muted">${c.hint}</div>` : ''}</span>${c.current ? html`<span class="pill good">mevcut</span>` : ''}</label>`)}</div>
    <div class="notice small">${note}</div></div>`);
  s.setFoot(html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>Kaydet</button>`);
  $('[data-save]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
    const x = $('input[name=cargo]:checked', s.el);
    if (!x) return toast('Kargo firması seçin', true);
    const res = await api(`orders/${enc}/cargo`, { method: 'POST', body: { package_id: pkg.id, cargo: { id: x.value, name: x.dataset.name } } });
    toast(res.message); s.close(); await done();
  });
}

// ---------- kargoya ver / kendi anlaşmanla takip no ----------
function shipDialog(d, pkg, done, { editOnly = false } = {}) {
  const o = d.order, open = packagesOf(o).filter((p) => p.status === 'open');
  if (!pkg && open.length > 1) return toast('Birden fazla paket var: her paketi kendi kartından gönderin');
  pkg = pkg || open[0];
  if (!pkg) return toast('Gönderilecek açık paket yok');
  const c = (d.channel || {}).caps || {}, name = ch(o.channel).name;
  const code = pkg.barcode || pkg.tracking;
  const s = sheet({
    title: editOnly ? `Paket ${pkg.no} · kendi anlaşmanızla gönderim` : `Paket ${pkg.no} kargoya ver`, size: 'narrow',
    body: html`<div class="stack">
      <div class="small muted">${name} · #${o.order_number} · ${o.customer}</div>
      ${!editOnly && code ? html`<dl class="kv small"><dt>Kargo</dt><dd>${pkg.cargo_company || '—'}</dd><dt>Barkod / takip</dt><dd class="num">${code}</dd><dt>Etiket</dt><dd>${pkg.label_printed_at ? `yazdırıldı (${shortDT(pkg.label_printed_at)})` : html`<span style="color:var(--amber)">yazdırılmadı</span>`}</dd></dl>`
        : html`${editOnly ? html`<div class="notice small">Kanalın kargo sistemi dışında (kendi kargo anlaşmanızla) gönderdiğiniz paketler içindir.</div>` : ''}
        <label class="field"><span>Kargo firması</span><input class="input" list="cargo-dl" data-f="cargo" value="${pkg.cargo_company || o.cargo_company || ''}"><datalist id="cargo-dl">${((state.settings && state.settings.cargo_companies) || []).map((x) => html`<option value="${x}">`)}</datalist></label>
        <label class="field"><span>Takip no</span><input class="input" data-f="tracking" value="${pkg.tracking || ''}"></label>`}
      ${o.channel === 'trendyol' && !editOnly ? html`<label class="field"><span>Fatura no (isteğe bağlı, Trendyol'a "Faturalandı" bildirilir)</span><input class="input" data-f="invoice"></label>` : ''}
      ${!editOnly ? html`<div class="notice small">${c.ship === 'remote' ? `Gönderim ${name}'a bildirilir.` : `${name}'da paket, kargo firması teslim alıp okutunca “Kargoda” olur; burada panel kaydı güncellenir.`}</div>` : ''}
    </div>`,
    foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>${editOnly ? 'Kaydet' : html`<i class="ico ico-truck"></i>Kargoya ver`}</button>`,
  });
  const f = (k) => { const x = $(`[data-f=${k}]`, s.el); return x ? x.value.trim() : ''; };
  $('[data-save]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
    const enc = encodeURIComponent(o.id);
    if (editOnly) {
      if (pkg.virtual) return toast('Önce paket oluşturun', true);
      await api(`orders/${enc}/tracking`, { method: 'POST', body: { package_id: pkg.id, tracking: f('tracking'), cargo_company: f('cargo') } });
      toast('Kaydedildi');
    } else {
      const r = await api(`orders/${enc}/ship`, { method: 'POST', body: { package_id: pkg.virtual ? undefined : pkg.id, tracking: f('tracking') || undefined, cargo_company: f('cargo') || undefined, invoice_number: f('invoice') } });
      toast(r.message);
    }
    s.close(); await done();
  });
}

// ---------- paketlere böl / paket ekle ----------
function splitEditor(d, extra, done) {
  const o = d.order, live = o.items.filter((i) => i.status !== 'cancelled');
  if (o.packages.some((p) => p.status === 'shipped')) return toast('Kargoya verilmiş paketi olan sipariş yeniden bölünemez', true);
  if (o.packages.some((p) => p.remote_id) && d.channel && d.channel.caps.split !== 'remote-async') return toast(`Paketler ${ch(o.channel).name}'da oluşturulmuş. Yeniden bölmek için önce paket menüsünden “Paketi iptal et”.`, true);
  let count = Math.min(8, Math.max(2, o.packages.length + extra));
  const grid = new Map(live.map((i) => [String(i.line_id), Array(8).fill(0)]));
  if (o.packages.length) o.packages.forEach((p, k) => p.items.forEach((x) => { const g = grid.get(String(x.line_id)); if (g) g[k] = x.qty; }));
  else live.forEach((i, k) => { grid.get(String(i.line_id))[live.length > 1 && k === live.length - 1 ? 1 : 0] = i.quantity; });
  const desi = Array(8).fill('');
  const s = sheet({ title: `Sipariş #${o.order_number} · paketler`, size: 'wide' });
  const draw = () => {
    s.setBody(html`<div class="stack">
      <p class="muted small" style="margin:0">Her ürünün adedini paketlere dağıtın. Her paket için ayrı kargo etiketi oluşur.${d.channel && d.channel.caps.split === 'remote' ? ` Paketler ${ch(o.channel).name}'da da oluşturulur.` : d.channel && d.channel.caps.split === 'remote-async' ? ' Bölme Trendyol\'a gönderilir; yeni paketler birkaç dakika sonra senkronla gelir.' : d.channel && d.channel.caps.pack ? ` Paketler “Paketle” adımında ${ch(o.channel).name}'a gönderilir.` : ''}</p>
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
      grid.get(lid)[Number(k)] = Math.max(0, Math.round(Number(e.target.value) || 0));
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
      const groups = Array.from({ length: count }, (_, k) => ({ desi: Number(String(desi[k]).replace(',', '.')) || null, items: live.map((i) => ({ line_id: String(i.line_id), qty: grid.get(String(i.line_id))[k] })).filter((x) => x.qty > 0) })).filter((g) => g.items.length);
      busy(b, async () => { const r = await api(`orders/${encodeURIComponent(o.id)}/split`, { method: 'POST', body: { groups } }); toast(r.message); s.close(); await done(); });
    }
  });
}

// ---------- sipariş detayı (tam) ----------
const EV = { accept: 'İşleme alındı', pack: 'Paketlendi (kargoya hazır)', split: 'Paketlere bölündü', cargo: 'Kargo firması seçildi', 'cancel-package': 'Paket iptal edildi', ship: 'Kargoya verildi', tracking: 'Takip no girildi', label: 'Etiket oluşturuldu', 'label-printed': 'Etiket yazdırıldı', 'label-unprinted': 'Yazdırıldı işareti kaldırıldı', status: 'Durum elle değiştirildi', processed: 'Kanalda işlem yapıldı', };
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
        ${o.remote_status ? html`<span class="muted tiny" title="Kanaldaki durum">(${o.remote_status})</span>` : ''}${o.extra && o.extra.awaitingPayment ? html`<span class="pill warn">Ödeme bekleniyor</span>` : ''}
        ${o.ship_by ? html`<span class="muted small">· Son kargoya teslim: <b>${dateTime(o.ship_by)}</b></span>` : ''}${o.extra && o.extra.cargoChoice ? html`<span class="muted small">· Müşterinin seçtiği: ${o.extra.cargoChoice}</span>` : ''}</div>
      <div data-ops></div>
      <div class="two-col" style="margin-top:16px">
        <div class="stack">
          <div class="card">
            <div class="card-head"><h3>Ürünler</h3><span class="muted small">${o.items.filter((i) => i.status !== 'cancelled').reduce((t, i) => t + i.quantity, 0)} adet</span></div>
            ${o.items.map((i) => html`<div class="li" style="${i.status === 'cancelled' ? 'opacity:.5' : ''}">${thumb(i.product_image || i.image, i.name)}
              <div style="min-width:0;flex:1"><div class="ellipsis" style="font-weight:650">${i.product_name || i.name}</div>
                <div class="muted small">${[i.sku, i.barcode].filter(Boolean).join(' · ')}${i.status === 'cancelled' ? ' · İptal' : ''}</div>
                ${i.product_id ? html`<div class="tiny muted">Ortak stok: <b>${i.product_stock}</b></div>` : html`<div class="tiny" style="color:var(--amber)">Panelde eşleşmemiş — <a class="link" href="#/eslestirme">eşleştir</a></div>`}</div>
              <div style="text-align:right" class="num"><div><b>${i.quantity}</b> × ${money(i.unit_price)}</div><div class="muted small">${money(i.total)}</div></div></div>`)}
          </div>
          <div class="card">
            <div class="card-head"><h3>İşlem geçmişi</h3><span class="muted tiny">panel ve kanal</span></div>
            ${(o.events || []).length ? html`<div class="timeline">${o.events.map((e) => html`<div class="ev ${e.source}"><span class="dot"></span><div style="flex:1;min-width:0">
              <div><b>${e.source === 'panel' ? EV[e.action] || e.action : e.action === 'processed' ? `${ch(o.channel).name} üzerinden işlem yapıldı` : `${ch(o.channel).name}'da durum değişti`}</b>${e.note && e.source === 'panel' ? html` <span class="muted">· ${e.note}</span>` : ''}</div>
              <div class="muted tiny">${dateTime(e.at)} · ${e.source === 'panel' ? `Panel${e.user ? ` (${e.user})` : ''}` : `${e.note || '?'} → ${e.remote_status || '?'}`}</div></div></div>`)}</div>` : html`<div class="muted small">Henüz kayıt yok</div>`}
          </div>
        </div>
        <div class="stack">
          <div class="card">
            <div class="card-head"><h3>Alıcı</h3><button class="btn sm ghost" data-copy><i class="ico ico-copy"></i>Kopyala</button></div>
            <div style="font-weight:700">${a.name || o.customer}</div><div class="small">${a.line}</div><div class="small">${[a.district, a.city].filter(Boolean).join(' / ')}</div><div class="small muted">${a.phone || o.phone}${o.email ? ` · ${o.email}` : ''}</div>
            ${!(a.phone || o.phone) ? html`<div class="notice warn small" style="margin-top:8px">Telefon yok: bazı kargo firmaları barkod oluşturmaz.</div>` : ''}
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

// Toplu etiket: seçilen siparişler paketlenir (kanalda kargoya hazırlanır) ve etiketleri alınır; görsel/panel etiketleri
// tek seferde yazdırılır, PDF/ZPL dosyaları indirilir. Sonra yazdırma onayı istenir.
export async function bulkLabels(ids, { fetch = true, done } = {}) {
  const r = await api('labels', { method: 'POST', body: { ids, fetch } });
  const panel = [], images = [], files = [], marks = [];
  for (const { order, labels } of r.orders) {
    for (const l of labels) {
      const pkg = order.packages.find((p) => p.id === l.package_id);
      if (!pkg) continue;
      if (l.official) (['png', 'jpg', 'gif'].includes(l.official.format) ? images : files).push(l.official);
      // Kendi etiketimiz yalnızca: kanal bunu onayladıysa (ör. Trendyol'da ortak etiketi olmayan firma), kanalın etiket servisi yoksa
      // ya da gönderi kendi anlaşmanızla yapıldıysa. Etiket servisi olan kanalda gerçek etiket gelmeden kendi etiketimiz basılmaz.
      else if (l.panel || ((pkg.agreement === 'own' || (ch(order.channel).caps || {}).label !== 'remote') && (pkg.barcode || pkg.tracking))) panel.push({ order, pkg });
      else continue;
      marks.push({ orderId: order.id, pkgId: pkg.id });
    }
  }
  for (const f of files) downloadFile(f.filename, f.data, f.format === 'pdf' ? 'application/pdf' : 'text/plain');
  if (images.length) await printImages(images);
  if (panel.length) await printLabels(panel, r.sender);
  const by = new Map();
  for (const x of marks) by.set(x.orderId, [...(by.get(x.orderId) || []), x.pkgId]);
  for (const [oid, pids] of by) await mark(oid, pids, 'viewed');
  if (r.errors.length) toast(r.errors.slice(0, 3).join(' · ') + (r.errors.length > 3 ? ` (+${r.errors.length - 3})` : ''), true);
  else toast(`${marks.length} etiket hazırlandı${files.length ? ` (${files.length} dosya indirildi)` : ''}`);
  if (marks.length) askPrinted(marks, done);
  return r;
}
export { n, shortDT };

// Kargo sayfası için tek paket işlemi: 'label' (paketle + etiket al + yazdır) | 'ship' (kargoya ver) | 'cargo'
export async function packageAction(kind, orderId, pkgId, done) {
  const d = await api('orders/' + encodeURIComponent(orderId));
  const pkg = packagesOf(d.order).find((p) => (pkgId ? p.id === pkgId : true));
  if (kind === 'ship') return shipDialog(d, pkg, done);
  if (kind === 'cargo') return cargoDialog(d, pkg, done);
  const r = await api(`orders/${encodeURIComponent(orderId)}/label`, { method: 'POST', body: { package_id: pkgId || undefined } });
  if (r.error || r.pending) { toast(r.error || r.pending, true); done && done(); return; }
  await outputLabel(r, { done });
  done && done();
}
