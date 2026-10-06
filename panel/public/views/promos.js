// Fırsat etiketleri: Trendyol avantajlı ürün yıldız eşikleri, Hepsiburada flaş indirim / fırsat davetleri (Excel'den yüklenir).
// Her eşik fiyatında kâr görünür; seçilen eşik fiyatı ilanın kanal fiyatı olur ve kanala gönderilir (bkz. src/promos.js).
import { api, state, html, raw, render, $, $$, n, money, date, ago, ch, chLogo, thumb, actions, busy, toast, confirmBox } from '../core.js';
import { readSheet } from '../sheetread.js';

const KINDS = [['advantage', 'Avantajlı ürün etiketi'], ['flash', 'Flaş indirim'], ['deal', 'Kampanya daveti']];
const kindName = (k) => (KINDS.find((x) => x[0] === k) || [k, k])[1];
// Excel'in nereden indirileceği (kanal türüne göre)
const WHERE = {
  trendyol: 'Trendyol satıcı paneli → Ürünler / Kampanyalar → <b>Avantajlı Ürün Etiketleri</b> sayfasındaki <b>Excel\'e aktar</b> ile indirdiğiniz dosya (barkod ve yıldız eşik fiyatı sütunlarıyla).',
  hepsiburada: 'Hepsiburada Merchant Portal → Kampanyalar → <b>Flaş indirim / fırsat davetleri</b> listesinden indirdiğiniz Excel (Hepsiburada SKU ya da satıcı stok kodu ve kampanya fiyatı sütunlarıyla).',
};
const marg = (x) => (x && x.margin != null ? html`<span class="tiny ${x.margin < 0 ? 'neg' : x.margin < 8 ? 'warn-t' : 'pos'}">%${n(Math.round(x.margin))}${x.profit != null ? ` · ${money(x.profit)}` : ''}</span>` : html`<span class="tiny muted" title="Ürünün alış fiyatı girilmemiş">kâr ?</span>`);

export async function promosView(el) {
  const chs = () => state.channels.filter((c) => !c.paused && c.type !== 'ikas' && !['shopify', 'woocommerce'].includes(c.type));
  const f = { channel: (chs().find((c) => c.type === 'trendyol') || chs()[0] || {}).id || '', kind: 'advantage', show: 'all', q: '' };
  let data = null;
  const sel = new Set();
  const list = () => (data ? data.offers.filter((o) => (f.show === 'all' || (f.show === 'off' ? o.remote_id && !o.tiers.some((t) => t.ok) : f.show === 'nomatch' ? !o.remote_id : !!o.applied_at))
    && (!f.q || `${o.name} ${o.sku || ''} ${o.barcode || ''}`.toLocaleLowerCase('tr').includes(f.q.toLocaleLowerCase('tr')))) : []);
  function draw() {
    const c = ch(f.channel), rows = list(), offers = data ? data.offers : [];
    const tierNames = offers.reduce((a, o) => (o.tiers.length > a.length ? o.tiers.map((t) => t.label) : a), []);
    const groups = data ? data.groups : [];
    render(el, html`<div class="stack">
      <div class="notice small"><i class="ico ico-tag"></i><div><b>Fırsat etiketleri</b> — Trendyol avantajlı ürün yıldızları ve Hepsiburada flaş indirim gibi fiyat koşullu kampanyalar için pazaryerleri açık servis sunmuyor.
        Pazaryeri panelinden indirdiğiniz listeyi buraya yükleyin: her eşik fiyatında kârınızı görün, uygun olanı tek tıkla kanala gönderin. Fiyat koşulu sağlanınca etiketi / kampanyayı pazaryeri kendisi verir.</div></div>
      ${groups.length ? html`<div class="row wrap" style="gap:8px">${groups.map((g) => html`<button class="chip ${g.channel === f.channel && g.kind === f.kind ? 'on' : ''}" data-act="group" data-ch="${g.channel}" data-k="${g.kind}">${chLogo(g.channel, true)} ${ch(g.channel).name} · ${kindName(g.kind)} <b class="num">${n(g.n)}</b>${g.applied ? html` <span class="tiny muted">· ${n(g.applied)} uygulandı</span>` : ''}</button>`)}</div>` : ''}
      <div class="card stack">
        <div class="row wrap" style="gap:10px;align-items:flex-end">
          <label class="field" style="min-width:170px"><span>Kanal</span><select class="input" data-f="channel">${chs().map((x) => html`<option value="${x.id}" ${x.id === f.channel ? 'selected' : ''}>${x.name}</option>`)}</select></label>
          <label class="field" style="min-width:190px"><span>Kampanya türü</span><select class="input" data-f="kind">${KINDS.map(([k, t]) => html`<option value="${k}" ${k === f.kind ? 'selected' : ''}>${t}</option>`)}</select></label>
          <label class="btn primary" style="cursor:pointer"><i class="ico ico-upload"></i>Excel / CSV yükle<input type="file" accept=".xlsx,.csv,.txt" data-file hidden></label>
          ${offers.length ? html`<button class="btn ghost" data-act="clear"><i class="ico ico-x"></i>Listeyi sil</button>` : ''}
        </div>
        <div class="muted small">${WHERE[c.type] ? raw(WHERE[c.type]) : 'Pazaryeri panelinden indirdiğiniz kampanya / davet listesi.'} Barkod, stok kodu ya da kanal ürün kodu sütunu ve en az bir eşik / kampanya fiyatı sütunu yeterli; sütun adları kendiliğinden tanınır.</div>
      </div>
      ${!data ? html`<div class="card empty"><i class="ico ico-sync spin"></i></div>` : !offers.length ? html`<div class="card empty">Bu kanal ve tür için yüklenmiş liste yok</div>` : html`
      <div class="row wrap"><div class="tabs" style="flex:1;min-width:0">${[['all', 'Tümü', offers.length], ['off', 'Etikette değil', offers.filter((o) => o.remote_id && !o.tiers.some((t) => t.ok)).length], ['applied', 'Uygulanan', offers.filter((o) => o.applied_at).length], ['nomatch', 'Eşleşmeyen', offers.filter((o) => !o.remote_id).length]]
        .map(([k, t, cnt]) => html`<button class="tab ${f.show === k ? 'on' : ''}" data-act="show" data-k="${k}">${t} <span class="muted">${n(cnt)}</span></button>`)}</div>
        <div class="search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün, barkod, stok kodu" data-q value="${f.q}"></div></div>
      <div class="card row wrap small" style="gap:10px" data-bulk>
        <b>${n(sel.size)} seçili</b><span class="muted">→</span>
        <select class="input" style="width:auto" data-tier>${tierNames.map((t, i) => html`<option value="${i}">${t}</option>`)}</select>
        <label class="row" style="gap:6px">en az kâr %<input class="input" style="width:70px" data-min inputmode="decimal" placeholder="—"></label>
        <button class="btn primary sm" data-act="apply" ${sel.size ? '' : 'disabled'}><i class="ico ico-check"></i>Seçilenlere uygula</button>
        <span class="muted tiny">Eşik fiyatı ilanın ${c.name || 'kanal'} fiyatı olur ve kanala gönderilir; kâr oranı sınırın altına düşecek ürünler atlanır.</span></div>
      <div class="card flush"><div class="table-wrap"><table class="t"><thead><tr><th style="width:28px"><input type="checkbox" data-all ${rows.length && rows.every((o) => sel.has(o.key)) ? 'checked' : ''}></th><th>Ürün</th><th class="r">Fiyatınız</th>${tierNames.map((t) => html`<th class="r">${t}</th>`)}<th></th></tr></thead><tbody>
        ${rows.slice(0, 500).map((o) => html`<tr data-key="${o.key}">
          <td><input type="checkbox" data-sel ${sel.has(o.key) ? 'checked' : ''} ${o.remote_id ? '' : 'disabled'}></td>
          <td><div class="row" style="gap:10px;min-width:220px">${thumb(o.image, o.name, 'sm')}<div style="min-width:0"><div class="ellipsis" style="font-weight:650;max-width:340px">${o.name}${o.variant ? html` <span class="muted">· ${o.variant}</span>` : ''}</div>
            <div class="tiny muted">${[o.sku, o.barcode].filter(Boolean).join(' · ')}${o.stock != null ? ` · stok ${n(o.stock)}` : ''}${o.ends_at ? ` · bitiş ${date(o.ends_at)}` : ''}</div>
            ${!o.remote_id ? html`<span class="pill warn tiny">İlan bulunamadı</span>` : ''}${o.applied_at ? html`<span class="pill info tiny" title="${ago(o.applied_at)}">${money(o.applied_price)} uygulandı${o.pending ? ' · gönderiliyor' : ''}</span>` : ''}</div></div></td>
          <td class="r"><div class="num" style="font-weight:700">${o.price ? money(o.price) : '—'}</div>${marg(o.now)}</td>
          ${tierNames.map((_, i) => { const t = o.tiers[i]; return html`<td class="r">${t ? html`<button class="tierbtn ${t.ok ? 'ok' : ''}" data-act="one" data-i="${i}" ${o.remote_id ? '' : 'disabled'} title="${t.ok ? 'Fiyatınız bu eşiği sağlıyor' : 'Bu fiyatı uygula'}">
            <span class="num">${money(t.price)}</span>${t.ok ? html`<i class="ico ico-check"></i>` : ''}<br>${marg(t)}</button>` : html`<span class="muted">—</span>`}</td>`; })}
          <td></td></tr>`)}
      </tbody></table></div>${rows.length > 500 ? html`<div class="muted small" style="padding:10px 14px">İlk 500 ürün gösteriliyor; aramayla daraltın.</div>` : ''}</div>`}
    </div>`);
  }
  async function load() { data = null; draw(); data = await api(`promos?channel=${encodeURIComponent(f.channel)}&kind=${f.kind}`).catch((e) => ({ offers: [], groups: [], error: e.message })); if (data.error) toast(data.error, true); draw(); }
  async function apply(keys, tier, btn) {
    const min = $('[data-min]', el) ? $('[data-min]', el).value.trim().replace(',', '.') : '';
    await busy(btn, async () => {
      const r = await api('promos/apply', { method: 'POST', body: { channel: f.channel, kind: f.kind, keys, tier: Number(tier) || 0, minMargin: min === '' ? null : Number(min) } });
      toast(`${n(r.applied)} ilana uygulandı${r.skipped ? ` · ${n(r.skipped)} atlandı (kâr sınırı)` : ''}${r.unmatched ? ` · ${n(r.unmatched)} eşleşmedi` : ''}`, !r.applied);
      sel.clear(); await load();
    });
  }
  el.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset.f) { f[t.dataset.f] = t.value; sel.clear(); load(); return; }
    if (t.matches('[data-sel]')) { const k = t.closest('[data-key]').dataset.key; t.checked ? sel.add(k) : sel.delete(k); draw(); return; }
    if (t.matches('[data-all]')) { list().filter((o) => o.remote_id).forEach((o) => (t.checked ? sel.add(o.key) : sel.delete(o.key))); draw(); return; }
    if (t.matches('[data-file]') && t.files[0]) {
      const file = t.files[0];
      await busy(null, async () => {
        const rows = await readSheet(file);
        if (!rows.length) { toast('Dosyada satır bulunamadı', true); return; }
        const r = await api('promos/import', { method: 'POST', body: { channel: f.channel, kind: f.kind, rows } });
        toast(`${n(r.imported)} ürün yüklendi · ${n(r.matched)} ilanla eşleşti · eşikler: ${r.tiers.join(', ')}`);
        await load();
      });
      t.value = '';
    }
  });
  el.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { f.q = e.target.value; clearTimeout(el._q); el._q = setTimeout(() => { draw(); const q = $('[data-q]', el); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250); } });
  actions(el, {
    group: (t) => { f.channel = t.dataset.ch; f.kind = t.dataset.k; sel.clear(); load(); },
    show: (t) => { f.show = t.dataset.k; draw(); },
    one: (t) => apply([t.closest('[data-key]').dataset.key], t.dataset.i, t),
    apply: (t) => apply([...sel], $('[data-tier]', el).value, t),
    clear: async (t) => {
      if (!(await confirmBox(`${ch(f.channel).name} · ${kindName(f.kind)} listesi silinsin mi? (Uygulanan fiyatlar değişmez)`, 'Sil'))) return;
      busy(t, async () => { await api('promos/clear', { method: 'POST', body: { channel: f.channel, kind: f.kind } }); toast('Liste silindi'); await load(); });
    },
  });
  await load();
  return { refresh: load };
}
