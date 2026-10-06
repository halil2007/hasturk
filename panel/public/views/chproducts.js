// Kanal Ürünleri: her kanaldan (Trendyol, Hepsiburada, ikas …) çekilen ilanlar kanal kanal listelenir. Firma tüm ürünlerini panele
// almak zorunda değildir: istediğini seçip "Panele ekle" der (aynı barkod / stok koduyla ürün varsa ona bağlanır, yoksa ürün kartı açılır),
// istemediğini yok sayar. Kanal başına mod: "Otomatik" (yeni ilanlar kendiliğinden ürün olur) ya da "Ben seçeyim".
import { api, html, render, $, n, money, ago, ch, chLogo, thumb, actions, busy, toast, debounce, popMenu, confirmBox, isMobile, activeChannels } from '../core.js';
import { loadSummary, setQuery } from '../app.js';
import { findProduct } from './match.js';

const TABS = [['unlinked', 'Panelde değil'], ['linked', 'Panelde'], ['ignored', 'Yok sayılan'], ['zero', 'Stoğu bitmiş'], ['all', 'Tümü']];
const vtag = (v, name) => (v && !String(name || '').includes(v) ? html`<span class="var-tag">${v}</span>` : '');

export async function channelProductsView(el, rest, query = {}) {
  const f = { channel: query.channel || '', state: query.state || 'unlinked', q: query.q || '', page: 1, limit: 50 };
  let chans = [], data = { listings: [], total: 0, counts: {} };
  const sel = new Set();
  render(el, html`<div class="stack">
    <div class="ch-tabs" data-chtabs></div>
    <div data-head></div>
    <div class="row wrap page-actions">
      <div class="search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün adı, SKU, barkod" data-q value="${f.q}"></div>
      <span class="spacer"></span>
      <button class="btn" data-act="pull" title="Bu kanaldaki ilanları şimdi yeniden çek"><i class="ico ico-sync"></i>Kanaldan yenile</button>
    </div>
    <div class="tabs" data-tabs></div>
    <div class="card flush" data-box></div>
  </div>`);

  const cur = () => chans.find((c) => c.channel === f.channel) || {};
  function drawTabs() {
    render($('[data-chtabs]', el), html`${chans.map((c) => html`<button class="ch-tab ${f.channel === c.channel ? 'on' : ''}" data-act="ch" data-id="${c.channel}">${chLogo(c.channel)}<span>${ch(c.channel).name}</span>${c.unlinked ? html`<span class="badge-n" title="Panelde olmayan ilan">${n(c.unlinked)}</span>` : ''}</button>`)}`);
    const c = cur();
    render($('[data-head]', el), c.channel ? html`<div class="card cp-head">
      <div class="row wrap" style="gap:14px">
        <div style="flex:1;min-width:240px"><div class="row">${chLogo(c.channel)}<h2>${ch(c.channel).name} ürünleri</h2></div>
          <div class="muted small" style="margin-top:4px">${n(c.total)} ilan · <b>${n(c.linked)}</b> panelde · <b>${n(c.unlinked)}</b> panelde değil${c.synced_at ? ` · son çekim ${ago(c.synced_at)}` : ''}</div></div>
        <div class="cp-mode"><div class="small" style="font-weight:650;margin-bottom:6px">Bu kanaldaki yeni ürünler</div>
          <div class="seg" data-mode><button data-v="auto" class="${c.manual ? '' : 'on'}">Panele otomatik eklensin</button><button data-v="manual" class="${c.manual ? 'on' : ''}">Ben seçeyim</button></div></div>
      </div>
      <div class="muted tiny" style="margin-top:10px">${c.manual
    ? 'Ben seçeyim: ilanlar kendiliğinden ürün kartına dönüşmez. Aynı barkod / stok kodlu ürün panelde varsa ona yine kendiliğinden bağlanır. İstediğiniz ilanları seçip “Panele ekle” deyin.'
    : c.catalog ? 'Otomatik: bu kanal ana katalog; buradaki her yeni ilan senkronda kendiliğinden panel ürünü olur.' : 'Otomatik: bu kanaldaki ilanlar panelde var olan ürünlere kendiliğinden bağlanır; karşılığı olmayanlar burada ve Eşleştirme\'de bekler. Ana katalog (yeni ürün açan kanal) Ayarlar\'dan seçilir.'}</div>
    </div>` : '');
    const cn = data.counts || {};
    render($('[data-tabs]', el), html`${TABS.map(([k, t]) => html`<button class="tab ${f.state === k ? 'on' : ''}" data-act="st" data-k="${k}">${t}<span class="n">${n(k === 'all' ? cn.total || 0 : cn[k] || 0)}</span></button>`)}`);
  }

  const stateCell = (l) => (l.product_id ? html`<a class="pill good" href="#/urunler?q=${encodeURIComponent(l.product_sku || l.product_name || '')}" title="Panel ürünü: ${l.product_name || ''}">Panelde</a>`
    : l.ignored && l.match === 'zero' ? html`<span class="pill">Stoğu yok</span>` : l.ignored ? html`<span class="pill">Yok sayıldı</span>` : html`<span class="pill amber">Panelde değil</span>`);
  // Önerilen eşleşme: panelde var olan en benzer ürün (puan ve neden); "Bağla" ilanı o ürüne bağlar
  const sugg = (l) => (!l.product_id && l.suggest ? html`<div class="cp-sug"><span class="score ${l.suggest.score >= 85 ? 'hi' : l.suggest.score >= 60 ? 'mid' : 'lo'}" title="${l.suggest.why || ''}">${l.suggest.score}</span>
      <div style="min-width:0;flex:1"><div class="muted tiny">Önerilen eşleşme</div><div class="ellipsis small" style="font-weight:600;max-width:260px" title="${l.suggest.name}">${l.suggest.name}</div><div class="muted tiny ellipsis" style="max-width:260px">${[l.suggest.sku, l.suggest.barcode].filter(Boolean).join(' · ')}</div></div>
      <button class="btn sm outline" data-act="linksug" data-pid="${l.suggest.product_id}">Bağla</button></div>` : '');
  const acts = (l) => (l.product_id ? html`<span class="muted tiny ellipsis" style="max-width:180px;display:inline-block">${l.product_name || ''}</span>`
    : html`<button class="btn sm ${l.suggest && l.suggest.score >= 60 ? '' : 'primary'}" data-act="add1" title="Yeni ürün kartı aç (aynı barkod / stok kodlu ürün varsa ona bağlanır)">Yeni ürün olarak ekle</button><button class="icon-btn sm" data-act="more" aria-label="Diğer"><i class="ico ico-dots"></i></button>`);
  const pick = (l) => (l.product_id ? html`<span style="display:inline-block;width:18px"></span>` : html`<input type="checkbox" class="cb" data-sel="${l.remote_id}" ${sel.has(l.remote_id) ? 'checked' : ''} aria-label="Seç">`);

  function bulkbar() {
    if (sel.size) {
      return html`<div class="bulk"><b>${sel.size} ilan seçildi</b>
        <button class="btn sm primary" data-act="addsel"><i class="ico ico-plus"></i>Panele ekle</button>
        ${f.state === 'ignored' || f.state === 'zero' ? html`<button class="btn sm" data-act="unignoresel">Yok saymayı kaldır</button>` : html`<button class="btn sm" data-act="ignoresel">Yok say</button>`}
        <span class="spacer"></span><button class="btn sm ghost" data-act="clearsel">Seçimi kaldır</button></div>`;
    }
    const free = data.listings.filter((l) => !l.product_id);
    if (!free.length) return '';
    const strong = free.filter((l) => l.suggest && l.suggest.score >= 85).length;
    return html`<div class="bulk"><label class="check"><input type="checkbox" class="cb" data-selall> Bu sayfadakileri seç</label>
      ${strong ? html`<button class="btn sm outline" data-act="accept" title="En iyi aday en az 85 puan ve ikinci adaydan belirgin öndeyse bağlar"><i class="ico ico-check"></i>Güçlü önerileri bağla</button>` : ''}
      ${f.state !== 'linked' && data.total > data.listings.length ? html`<span class="spacer"></span><button class="btn sm outline" data-act="addall"><i class="ico ico-plus"></i>Filtredeki tümünü panele ekle (${n(Math.min(data.total, 2000))})</button>` : ''}</div>`;
  }
  function pager() {
    const pages = Math.max(1, Math.ceil(data.total / data.limit));
    if (pages < 2) return '';
    return html`<div class="pager"><span class="muted small" style="margin-right:auto">${n(data.total)} ilandan ${(data.page - 1) * data.limit + 1}–${(data.page - 1) * data.limit + data.listings.length}</span>
      <button class="pg" data-act="page" data-p="${Math.max(1, data.page - 1)}" ${data.page <= 1 ? 'disabled' : ''} aria-label="Önceki"><i class="ico ico-back"></i></button>
      <span class="small">${data.page} / ${pages}</span>
      <button class="pg" data-act="page" data-p="${Math.min(pages, data.page + 1)}" ${data.page >= pages ? 'disabled' : ''} aria-label="Sonraki"><i class="ico ico-chev"></i></button></div>`;
  }
  function draw() {
    drawTabs();
    const box = $('[data-box]', el);
    if (!chans.length) {
      return render(box, html`<div class="empty"><div style="font-weight:650;color:var(--text);margin-bottom:6px">Henüz kanaldan ürün çekilmedi</div>Entegrasyonlar'dan kanal bağlayın; ilanlar ilk senkronda buraya gelir.<div style="margin-top:12px"><a class="btn" href="#/entegrasyonlar">Entegrasyonlar</a></div></div>`);
    }
    const L = data.listings;
    const empty = html`<div class="empty">${f.q ? 'Aramaya uyan ilan yok' : f.state === 'unlinked' ? 'Bu kanalda panele alınmamış ilan kalmadı 🎉' : 'Bu filtrede ilan yok'}</div>`;
    if (isMobile()) {
      render(box, html`${bulkbar()}<div class="m-list">${L.length ? L.map((l) => html`<div class="m-card cp-card" data-key="${l.remote_id}">
        <div class="row" style="align-items:flex-start">${pick(l)}${thumb(l.image, l.name, 'lg')}<div style="min-width:0;flex:1"><div style="font-weight:650" class="clamp2">${l.name}${vtag(l.variant_name, l.name)}</div>
          <div class="muted tiny ellipsis">${[l.sku, l.barcode].filter(Boolean).join(' · ') || l.remote_id}</div>
          <div class="row" style="margin-top:4px;gap:10px"><b class="num">${money(l.price)}</b><span class="small ${l.remote_stock > 0 ? '' : 'down'}">${l.remote_stock ?? '—'} stok</span></div></div></div>
        ${sugg(l)}<div class="row">${stateCell(l)}<span class="spacer"></span>${acts(l)}</div></div>`) : empty}</div>${pager()}`);
      return;
    }
    render(box, html`${bulkbar()}<div class="table-wrap"><table class="t"><thead><tr><th style="width:40px"></th><th>İlan</th><th>SKU / barkod</th><th class="r">Fiyat</th><th class="r">Stok</th><th>Durum / önerilen eşleşme</th><th class="r"></th></tr></thead><tbody>
      ${L.map((l) => html`<tr data-key="${l.remote_id}" class="${sel.has(l.remote_id) ? 'sel-row' : ''}">
        <td>${pick(l)}</td>
        <td><div class="row">${thumb(l.image, l.name, 'sm')}<div style="min-width:0"><div class="ellipsis" style="max-width:420px;font-weight:600">${l.name}${vtag(l.variant_name, l.name)}</div><div class="muted tiny ellipsis" style="max-width:420px">${[l.brand, l.category].filter(Boolean).join(' · ')}</div></div></div></td>
        <td class="small"><div>${l.sku || '—'}</div><div class="muted tiny num">${l.barcode || ''}</div></td>
        <td class="r num">${money(l.price)}</td>
        <td class="r num ${l.remote_stock > 0 ? '' : 'down'}">${l.remote_stock ?? '—'}</td>
        <td style="min-width:300px">${l.suggest && !l.product_id ? sugg(l) : stateCell(l)}</td>
        <td class="r"><div class="row" style="justify-content:flex-end;gap:4px">${acts(l)}</div></td></tr>`)}
    </tbody></table></div>${L.length ? '' : empty}${pager()}`);
  }

  async function loadChannels() {
    const list = await api('channel-products/channels', { fresh: true });
    const order = activeChannels().map((c) => c.id);
    chans = list.filter((c) => order.includes(c.channel)).sort((a, b) => order.indexOf(a.channel) - order.indexOf(b.channel));
    if (!chans.some((c) => c.channel === f.channel)) f.channel = (chans.find((c) => c.unlinked) || chans[0] || {}).channel || '';
  }
  async function load() {
    setQuery({ channel: f.channel, state: f.state === 'unlinked' ? '' : f.state, q: f.q });
    if (!f.channel) { data = { listings: [], total: 0, counts: {} }; return draw(); }
    const p = new URLSearchParams({ channel: f.channel, state: f.state, page: f.page, limit: f.limit });
    if (f.q) p.set('q', f.q);
    data = await api('channel-products?' + p);
    draw();
  }
  const refresh = async (full = false) => {
    try { if (full || !chans.length) await loadChannels(); await load(); } catch (e) { toast(e.message, true); }
  };
  const after = async (msg) => { sel.clear(); toast(msg); loadSummary().catch(() => {}); await refresh(true); };
  const added = (r) => `${r.created ? `${n(r.created)} yeni ürün açıldı` : ''}${r.created && r.linked ? ', ' : ''}${r.linked ? `${n(r.linked)} ilan var olan ürüne bağlandı` : ''}${r.others ? ` · diğer kanallardan ${n(r.others)} ilan da eşleşti` : ''}` || 'Değişiklik yok';
  const keyOf = (t) => t.closest('[data-key]').dataset.key;
  const rowOf = (t) => data.listings.find((l) => l.remote_id === keyOf(t));

  actions(el, {
    ch: (t) => { f.channel = t.dataset.id; f.page = 1; sel.clear(); refresh(); },
    st: (t) => { f.state = t.dataset.k; f.page = 1; sel.clear(); refresh(); },
    page: (t) => { f.page = Number(t.dataset.p); refresh(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    linksug: (t) => busy(t, async () => { await api('channel-products/link', { method: 'POST', body: { channel: f.channel, remote_id: keyOf(t), product_id: Number(t.dataset.pid) } }); await after('İlan önerilen ürüne bağlandı'); }),
    accept: async (t) => {
      if (!(await confirmBox('Güçlü öneriler (85 puan ve üzeri, ikinci adaydan belirgin önde) var olan ürünlere bağlansın mı? Yanlış olanı Eşleştirme → Eşleşmiş ürünler\'den kaldırabilirsiniz.', 'Bağla'))) return;
      busy(t, async () => { const r = await api('channel-products/accept', { method: 'POST', body: { channel: f.channel } }); await after(`${n(r.linked || 0)} ilan önerilen ürüne bağlandı`); });
    },
    add1: (t) => busy(t, async () => { const r = await api('channel-products/add', { method: 'POST', body: { channel: f.channel, ids: [keyOf(t)] } }); await after(added(r)); }),
    addsel: (t) => busy(t, async () => { const r = await api('channel-products/add', { method: 'POST', body: { channel: f.channel, ids: [...sel] } }); await after(added(r)); }),
    addall: async (t) => {
      const k = Math.min(data.total, 2000);
      if (!(await confirmBox(`${ch(f.channel).name} kanalında bu filtredeki ${n(k)} ilan panele eklensin mi? Aynı barkod / stok kodlu ürün varsa ona bağlanır, yoksa yeni ürün kartı açılır.`, 'Panele ekle'))) return;
      busy(t, async () => { const r = await api('channel-products/add', { method: 'POST', body: { channel: f.channel, all: true, state: f.state, q: f.q } }); await after(added(r)); });
    },
    ignoresel: (t) => busy(t, async () => { const r = await api('channel-products/ignore', { method: 'POST', body: { channel: f.channel, ids: [...sel] } }); await after(`${n(r.changed)} ilan yok sayıldı`); }),
    unignoresel: (t) => busy(t, async () => { const r = await api('channel-products/ignore', { method: 'POST', body: { channel: f.channel, ids: [...sel], ignored: false } }); await after(`${n(r.changed)} ilan bekleyenlere alındı`); }),
    clearsel: () => { sel.clear(); draw(); },
    more: (t) => {
      const l = rowOf(t);
      if (!l) return;
      popMenu(t, [
        { icon: 'plus', label: 'Yeni ürün olarak ekle', run: () => api('channel-products/add', { method: 'POST', body: { channel: f.channel, ids: [l.remote_id] } }).then((r) => after(added(r))).catch((e) => toast(e.message, true)) },
        { icon: 'link', label: 'Var olan bir ürüne bağla (ara)', run: () => findProduct({ channel: f.channel, remote_id: l.remote_id }, () => after('İlan ürüne bağlandı'), 'channel-products/link') },
        l.ignored ? { icon: 'check', label: 'Yok saymayı kaldır', run: () => api('channel-products/ignore', { method: 'POST', body: { channel: f.channel, ids: [l.remote_id], ignored: false } }).then(() => after('Bekleyenlere alındı')).catch((e) => toast(e.message, true)) }
          : { icon: 'x', label: 'Yok say (panele alma)', run: () => api('channel-products/ignore', { method: 'POST', body: { channel: f.channel, ids: [l.remote_id] } }).then(() => after('Yok sayıldı')).catch((e) => toast(e.message, true)) },
      ], { title: l.name });
    },
    pull: (t) => busy(t, async () => {
      const r = await api('import', { method: 'POST', body: { channels: [f.channel] } });
      const v = r.channels && r.channels[f.channel];
      await after(typeof v === 'number' ? `${n(v)} ilan alındı${r.created ? ` · ${n(r.created)} yeni ürün` : ''}${r.linked ? ` · ${n(r.linked)} eşleşti` : ''}` : String(v || 'Tamamlandı'));
    }),
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode] button');
    if (!b || b.classList.contains('on')) return;
    const manual = b.dataset.v === 'manual';
    (async () => {
      if (!manual && !(await confirmBox(`${ch(f.channel).name} için otomatik moda geçilsin mi? ${cur().catalog ? 'Bu kanal ana katalog olduğundan panelde olmayan ilanlar sonraki senkronda kendiliğinden ürün kartı olur.' : 'İlanlar panelde var olan ürünlere kendiliğinden bağlanır.'}`, 'Otomatik yap'))) return;
      await api('channel-products/mode', { method: 'POST', body: { channel: f.channel, manual } });
      toast(manual ? 'Ben seçeyim: bu kanaldan kendiliğinden ürün açılmaz' : 'Otomatik mod açıldı');
      await refresh(true);
    })().catch((err) => toast(err.message, true));
  });
  el.addEventListener('change', (e) => {
    const c = e.target.closest('[data-sel]');
    if (c) { c.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel); draw(); }
    if (e.target.matches('[data-selall]')) { data.listings.filter((l) => !l.product_id).forEach((l) => (e.target.checked ? sel.add(l.remote_id) : sel.delete(l.remote_id))); draw(); }
  });
  $('[data-q]', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); f.page = 1; sel.clear(); refresh(); }, 300));
  await refresh(true);
  return { refresh: () => refresh(true) };
}
