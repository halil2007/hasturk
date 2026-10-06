// Fiyat önerileri: pazaryerinin buybox servisinden okunan rakip fiyatlarına göre ilan bazında öneri (bkz. src/suggest.js).
// "Birinciliği al": rakibin 1 kuruş altı; "Kâr artır": birinci sıra sizde, ikinci satıcının 1 kuruş altına kadar yükseltme.
// Her öneride önerilen fiyattaki kâr görünür; tek tıkla ya da toplu uygulanır, fiyat kanala gönderilir.
import { api, html, render, $, $$, n, money, ago, ch, chLogo, thumb, actions, busy, toast, confirmBox } from '../core.js';
import { bbChannels } from './buybox.js';

const marg = (x) => (x && x.margin != null ? html`<span class="tiny ${x.margin < 0 ? 'neg' : x.margin < 8 ? 'warn-t' : 'pos'}">%${n(Math.round(x.margin))} · ${money(x.profit)}</span>` : html`<span class="tiny muted" title="Ürünün alış fiyatı girilmemiş">kâr ?</span>`);

export async function suggestView(el) {
  const chs = bbChannels();
  const f = { channel: '', kind: 'win', q: '' };
  let data = null;
  const sel = new Set(), key = (s) => `${s.channel}|${s.remote_id}`;
  const list = () => (data ? data.items.filter((s) => (f.kind === 'loss' ? s.loss : s.kind === f.kind)
    && (!f.q || `${s.name} ${s.sku || ''} ${s.barcode || ''}`.toLocaleLowerCase('tr').includes(f.q.toLocaleLowerCase('tr')))) : []);
  function draw() {
    const rows = list(), c = data ? data.counts : {};
    render(el, html`<div class="stack">
      <div class="notice small"><i class="ico ico-tag"></i><div><b>Fiyat önerileri</b> pazaryerinin rakip fiyatlarından (buybox) kendiliğinden hazırlanır: birinci sıra rakipteyse rakibin 1 kuruş altı, sizdeyse ve ikinci satıcı yukarıdaysa kârınızı artıracak fiyat önerilir.
        Önerilen fiyattaki kârınızı görür, uygun olanı tek tıkla kanala gönderirsiniz. Fiyat kuralı tanımlı ürünlerde en düşük / en yüksek sınır aşılmaz.</div></div>
      ${!chs.length ? html`<div class="card empty">Rakip fiyatı veren bağlı pazaryeri yok. Trendyol ya da Hepsiburada bağlanınca öneriler burada görünür (Entegrasyonlar).</div>` : html`
      <div class="row wrap" style="gap:10px">${chs.length > 1 ? html`<div class="ch-tabs" style="flex:1;min-width:0"><button class="ch-tab ${!f.channel ? 'on' : ''}" data-act="ch" data-id=""><i class="ico ico-grid"></i>Tümü</button>${chs.map((x) => html`<button class="ch-tab ${f.channel === x.id ? 'on' : ''}" data-act="ch" data-id="${x.id}">${chLogo(x.id)}${x.name}</button>`)}</div>` : html`<span style="flex:1"></span>`}
        <button class="btn" data-act="check"><i class="ico ico-sync"></i>Rakip fiyatlarını yenile</button></div>
      <div class="row wrap"><div class="tabs" style="flex:1;min-width:0">${[['win', 'Birinciliği al', c.win], ['raise', 'Kâr artır', c.raise], ['loss', 'Zararına olanlar', c.loss]]
        .map(([k, t, cnt]) => html`<button class="tab ${f.kind === k ? 'on' : ''}" data-act="kind" data-k="${k}">${t} <span class="muted">${data ? n(cnt || 0) : ''}</span></button>`)}</div>
        <div class="search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün, barkod, stok kodu" data-q value="${f.q}"></div></div>
      ${!data ? html`<div class="card empty"><i class="ico ico-sync spin"></i></div>` : data.error ? html`<div class="notice bad">${data.error}</div>` : !rows.length ? html`<div class="card empty">${!data.checked ? 'Henüz rakip fiyatı okunmadı. "Rakip fiyatlarını yenile"ye basın; senkron her turda da parça parça okur.' : f.kind === 'win' ? 'Birinci sırayı fiyatla alabileceğiniz ürün yok 🎉' : f.kind === 'raise' ? 'Fiyatını yükseltebileceğiniz ürün yok' : 'Zararına öneri yok'}</div>` : html`
      ${f.kind !== 'loss' ? html`<div class="card row wrap small" style="gap:10px" data-bulk>
        <b>${n(sel.size)} seçili</b>
        <label class="row" style="gap:6px">en az kâr %<input class="input" style="width:70px" data-min inputmode="decimal" placeholder="—"></label>
        <button class="btn primary sm" data-act="apply" ${sel.size ? '' : 'disabled'}><i class="ico ico-check"></i>Seçilenlere uygula</button>
        <span class="muted tiny">Zararına olanlar ve kâr oranı sınırın altına düşenler atlanır.</span></div>` : ''}
      <div class="card flush"><div class="table-wrap"><table class="t"><thead><tr><th style="width:28px"><input type="checkbox" data-all ${rows.length && rows.every((s) => sel.has(key(s))) ? 'checked' : ''}></th><th>Ürün</th><th class="r">Fiyatınız</th><th class="r">${f.kind === 'raise' ? '2. satıcı' : 'Birinci satıcı'}</th><th class="r">Önerilen</th><th class="r">Satış (30 gün)</th></tr></thead><tbody>
        ${rows.slice(0, 500).map((s) => html`<tr data-key="${key(s)}">
          <td><input type="checkbox" data-sel ${sel.has(key(s)) ? 'checked' : ''} ${s.loss ? 'disabled' : ''}></td>
          <td><div class="row" style="gap:10px;min-width:220px">${thumb(s.image, s.name, 'sm')}<div style="min-width:0"><div class="ellipsis" style="font-weight:650;max-width:340px">${chLogo(s.channel, true)} ${s.name}${s.variant ? html` <span class="muted">· ${s.variant}</span>` : ''}</div>
            <div class="tiny muted">${[s.sku, s.barcode].filter(Boolean).join(' · ')}${s.stock != null ? ` · stok ${n(s.stock)}` : ''} · ${s.rank}. sıra · ${ago(s.checked_at)}</div>
            ${s.pending ? html`<span class="pill info tiny">fiyat gönderiliyor</span>` : ''}${s.limited ? html`<span class="pill tiny" title="Fiyat kuralının sınırı">${s.limited === 'min' ? 'en düşük fiyat sınırında' : 'en yüksek fiyat sınırında'}</span>` : ''}</div></div></td>
          <td class="r"><div class="num" style="font-weight:700">${money(s.price)}</div>${marg(s.now)}</td>
          <td class="r num">${money(s.competitor)}</td>
          <td class="r"><button class="tierbtn ${s.loss ? '' : 'ok'}" data-act="one" ${s.loss ? 'disabled' : ''} title="${s.loss ? 'Bu fiyatta zarar edersiniz' : 'Bu fiyatı uygula'}"><span class="num">${money(s.suggested)}</span> <span class="tiny ${s.diff < 0 ? 'neg' : 'pos'}">${s.diff > 0 ? '+' : ''}${money(s.diff)}</span><br>${marg(s.next)}</button></td>
          <td class="r num">${n(s.sold30)}</td></tr>`)}
      </tbody></table></div>${rows.length > 500 ? html`<div class="muted small" style="padding:10px 14px">İlk 500 ürün gösteriliyor; aramayla daraltın.</div>` : ''}</div>`}`}
    </div>`);
    const q = $('[data-q]', el);
    if (q) q.oninput = () => { f.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => { draw(); const x = $('[data-q]', el); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 250); };
    $$('[data-sel]', el).forEach((b) => { b.onchange = () => { const k = b.closest('tr').dataset.key; b.checked ? sel.add(k) : sel.delete(k); draw(); }; });
    const all = $('[data-all]', el);
    if (all) all.onchange = () => { for (const s of list()) if (!s.loss) all.checked ? sel.add(key(s)) : sel.delete(key(s)); draw(); };
  }
  async function load() {
    data = null; draw();
    data = await api(`suggestions${f.channel ? `?channel=${f.channel}` : ''}`).catch((e) => ({ items: [], counts: {}, error: e.message }));
    draw();
  }
  async function apply(items, t) {
    const min = $('[data-min]', el) ? $('[data-min]', el).value.trim() : '';
    await busy(t, async () => {
      const r = await api('suggestions/apply', { method: 'POST', body: { items, minMargin: min === '' ? null : Number(min.replace(',', '.')) } });
      toast(`${n(r.applied)} ilanın fiyatı güncellendi, kanala gönderiliyor${r.skipped ? ` · ${n(r.skipped)} ürün kâr sınırı nedeniyle atlandı` : ''}`);
      sel.clear(); await load();
    });
  }
  actions(el, {
    ch: (b) => { f.channel = b.dataset.id; sel.clear(); load(); },
    kind: (b) => { f.kind = b.dataset.k; sel.clear(); draw(); },
    check: (b) => busy(b, async () => {
      const r = await api('buybox/check', { method: 'POST', body: { channel: f.channel || undefined, limit: 300 } });
      toast(Object.entries(r).map(([k, v]) => `${ch(k).name}: ${typeof v === 'string' ? v : `${n(v)} ürün kontrol edildi`}`).join(' · ') || 'Kontrol edilecek ilan yok');
      await load();
    }),
    one: async (b) => {
      const k = b.closest('tr').dataset.key, s = data.items.find((x) => key(x) === k);
      if (!s || !(await confirmBox(`${s.name}: fiyat ${money(s.price)} → ${money(s.suggested)} olsun ve ${ch(s.channel).name}'a gönderilsin mi?`, 'Uygula'))) return;
      await apply([{ channel: s.channel, remote_id: s.remote_id }], b);
    },
    apply: async (b) => {
      const items = data.items.filter((s) => sel.has(key(s))).map((s) => ({ channel: s.channel, remote_id: s.remote_id }));
      if (items.length && (await confirmBox(`${n(items.length)} ürünün fiyatı önerilen fiyata çekilip kanala gönderilsin mi?`, 'Uygula'))) await apply(items, b);
    },
  });
  await load();
  return { refresh: load };
}
