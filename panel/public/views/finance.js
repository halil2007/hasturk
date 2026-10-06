// Gelir & Gider: seçilen dönemde satıştan kâra masraf basamakları (komisyon, kargo, hizmet bedeli, ek kesinti, stopaj, alış),
// kanal bazında tablo, hakediş (ödeme günleri, ödenen / ödenecek, mutabakat) ve pazaryerlerinin kestiği faturalar.
import { api, html, render, $, $$, money, money0, n, ch, chLogo, chBadge, date, dateTime, store, toast, actions, busy, activeChannels, isAdmin, sheet, confirmBox, thumb, state } from '../core.js';
import { viewOnly } from '../perms.js';
import { setQuery } from '../app.js';

const D = 864e5;
const startOfMonth = (k = 0) => { const d = new Date(Date.now() + 3 * 3600e3); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); d.setUTCMonth(d.getUTCMonth() - k); return d.getTime() - 3 * 3600e3; };
const RANGES = [
  ['month', 'Bu ay', () => [startOfMonth(0), Date.now() + 1]],
  ['last', 'Geçen ay', () => [startOfMonth(1), startOfMonth(0)]],
  ['30', 'Son 30 gün', () => [Date.now() - 30 * D, Date.now() + 1]],
  ['90', 'Son 90 gün', () => [Date.now() - 90 * D, Date.now() + 1]],
  ['year', 'Son 1 yıl', () => [Date.now() - 365 * D, Date.now() + 1]],
];

export async function financeView(el, rest, query = {}) {
  const f = { range: 'month', psort: 'profit', channel: query.channel || '', ...store.get('finance', {}), ...(query.channel ? { channel: query.channel } : {}) };
  let d = null, inv = null;
  render(el, html`<div class="stack">
    <div class="ch-tabs" data-chs></div>
    <div class="row wrap" style="align-items:center"><b style="margin-right:6px">Dönem:</b><div class="chips" data-ranges></div><span class="muted small" data-rlabel></span></div>
    <div class="kpis" data-kpis></div>
    <div class="stack">
      <div class="card"><div class="card-head"><h2>Masraf basamakları</h2><span class="muted small">satıştan kâra</span></div><div data-steps></div></div>
      <div class="card flush"><div class="card-pad card-head"><h2>Kanallara göre</h2></div><div data-chtable></div></div>
    </div>
    <div class="card flush" data-prod></div>
    <div class="card flush" data-exp></div>
    <div class="card flush" data-stl></div>
    <div class="card flush"><div class="card-pad card-head" style="flex-wrap:wrap;gap:8px"><h2>Kesilen faturalar</h2><span class="muted small" data-invsub></span><span class="spacer"></span>
      ${isAdmin() ? html`<button class="btn sm" data-act="invsync"><i class="ico ico-sync"></i>Faturaları ve kargo giderini çek</button>` : ''}</div><div data-inv></div></div>
  </div>`);

  const span = () => (RANGES.find((r) => r[0] === f.range) || RANGES[0])[2]();
  function draw() {
    const chs = activeChannels().filter((c) => c.enabled || c.demo);
    render($('[data-chs]', el), html`<button class="ch-tab ${!f.channel ? 'on' : ''}" data-act="ch" data-id=""><i class="ico ico-grid"></i>Tüm kanallar</button>${chs.map((c) => html`<button class="ch-tab ${f.channel === c.id ? 'on' : ''}" data-act="ch" data-id="${c.id}">${chLogo(c.id)}${c.name}</button>`)}`);
    render($('[data-ranges]', el), html`${RANGES.map(([k, t]) => html`<button class="chip ${f.range === k ? 'on' : ''}" data-act="range" data-k="${k}">${t}</button>`)}`);
    $('[data-rlabel]', el).textContent = `${date(d.from)} – ${date(Math.min(d.to, Date.now()) - 1)}`;
    const t = d.total, ded = t.commission + t.shipping + t.fee + t.rateFee + t.withholding + t.ads + t.penalty + t.returnLoss, net = f.channel ? t.profit : t.net;
    render($('[data-kpis]', el), html`
      <div class="kpi"><div class="label">Satış (ciro)</div><div class="value num">${money0(t.revenue)}</div><div class="delta flat">${n(t.orders)} sipariş</div></div>
      <div class="kpi"><div class="label">Pazaryeri kesintileri</div><div class="value num">${money0(ded)}</div><div class="delta flat">satışın %${n(t.revenue ? (ded / t.revenue) * 100 : 0)}'i</div></div>
      <div class="kpi"><div class="label">Hakediş</div><div class="value num">${money0(t.payout)}</div><div class="delta flat">hesabınıza geçen</div></div>
      <div class="kpi"><div class="label">${f.channel ? 'Brüt kâr' : net >= 0 ? 'Net kâr' : 'Net zarar'}</div><div class="value num" style="color:${net >= 0 ? 'var(--good)' : 'var(--bad)'}">${money0(net)}</div><div class="delta flat">${f.channel ? `kâr marjı %${n(t.margin)}` : `brüt ${money0(t.profit)} − işletme ${money0(t.expenses)}`}</div></div>`);
    const max = Math.max(1, ...d.steps.map((s) => Math.abs(s.v)));
    render($('[data-steps]', el), t.orders ? html`<div class="stack" style="gap:8px">${d.steps.map((s) => html`<div class="fin-step" style="${s.sum ? 'border-top:1px solid var(--line);padding-top:8px' : ''}">
        <div style="min-width:0"><div class="small" style="font-weight:${s.sum || s.k === 'revenue' ? 750 : 550}">${s.label}</div>${s.note ? html`<div class="tiny muted">${s.note}</div>` : ''}</div>
        <div class="bar" style="background:var(--surface-3);border-radius:6px;height:14px;overflow:hidden"><div style="height:100%;width:${(Math.abs(s.v) / max) * 100}%;border-radius:6px;background:${s.v < 0 ? 'var(--bad)' : s.k === 'profit' || s.k === 'net' ? 'var(--good)' : 'var(--primary)'};opacity:${s.sum || s.k === 'revenue' ? 1 : 0.7}"></div></div>
        <span class="amt num" style="color:${s.v < 0 ? 'var(--bad)' : s.k === 'net' ? 'var(--good)' : 'inherit'};${s.k === 'net' ? 'font-weight:800' : ''}">${s.v < 0 ? '−' : ''}${money(Math.abs(s.v))}</span>
        <span class="pct muted tiny" style="text-align:right">%${n(t.revenue ? (Math.abs(s.v) / t.revenue) * 100 : 0)}</span></div>`)}</div>
      <div class="muted tiny" style="margin-top:10px">Kesinti oranları Ayarlar → Giderler'den gelir; kanal gerçek komisyon, kargo ve hizmet bedelini bildirdiyse o kullanılır. Reklam, ceza ve kesinti faturaları pazaryerinin kestiği faturalardan (fatura tarihine göre) alınır.</div>`
      : html`<div class="empty">Bu dönemde sipariş yok</div>`);
    render($('[data-chtable]', el), d.channels.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Kanal</th><th class="r">Satış</th><th class="r">Komisyon</th><th class="r">Kargo</th><th class="r">Hizmet + ek</th><th class="r">Stopaj</th><th class="r" title="Reklam, ceza ve iade kaybı">Reklam / ceza / iade</th><th class="r">Hakediş</th><th class="r">Kâr</th></tr></thead><tbody>
      ${d.channels.map((c) => html`<tr><td>${chBadge(c.channel)}<div class="tiny muted">${n(c.orders)} sipariş</div></td><td class="r num">${money0(c.revenue)}</td><td class="r num">${money0(c.commission)}</td><td class="r num">${money0(c.shipping)}<div class="tiny muted" title="${c.shippingError ? 'Kargo gideri okunamadı: ' + c.shippingError : ''}">${c.shippingError && c.shippingSrc === 'estimate' ? html`<span style="color:var(--warn)">okunamadı</span>` : { api: 'fatura', mixed: 'fatura + tahmin', invoice: 'fatura toplamı', estimate: 'tahmin' }[c.shippingSrc] || ''}</div></td>
        <td class="r num">${money0(c.fee + c.rateFee)}</td><td class="r num">${money0(c.withholding)}</td><td class="r num">${money0(c.ads + c.penalty + c.returnLoss)}${c.returns ? html`<div class="tiny muted">${n(c.returns)} iade</div>` : ''}</td><td class="r num" style="font-weight:650">${money0(c.payout)}</td>
        <td class="r num" style="font-weight:750;color:${c.profit >= 0 ? 'var(--good)' : 'var(--bad)'}">${money0(c.profit)}<div class="tiny muted">%${n(c.margin)}</div></td></tr>`)}
    </tbody></table></div>` : html`<div class="empty">Veri yok</div>`);
    drawInvoices();
  }
  function drawInvoices() {
    const box = $('[data-inv]', el);
    if (!inv) return render(box, html`<div class="empty"><i class="ico ico-sync spin"></i></div>`);
    $('[data-invsub]', el).textContent = inv.items.length ? `${n(inv.total)} fatura · ${money0(inv.sum)}` : '';
    if (!inv.supported.length) return render(box, html`<div class="empty">Fatura bilgisi veren bağlı kanal yok.</div>`);
    render(box, html`
      ${inv.types.length ? html`<div class="row wrap" style="gap:8px;padding:0 16px 12px">${inv.types.map((x) => html`<button class="chip ${f.itype === x.type ? 'on' : ''}" data-act="itype" data-k="${x.type}">${x.type} <b class="num" style="margin-left:4px">${money0(x.amount)}</b> <span class="muted tiny">(${n(x.n)})</span></button>`)}${f.itype ? html`<button class="chip" data-act="itype" data-k="">Tümü</button>` : ''}</div>` : ''}
      ${inv.items.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Tarih</th><th>Kanal</th><th>Tür</th><th>Fatura no / açıklama</th><th class="r">Tutar</th><th></th></tr></thead><tbody>
        ${inv.items.map((x) => html`<tr><td class="small" style="white-space:nowrap">${date(x.date)}</td><td>${chLogo(x.channel, true)}</td><td><span class="pill">${x.type}</span></td>
          <td class="small"><div style="font-weight:600">${x.no || '—'}</div><div class="muted tiny ellipsis" style="max-width:360px">${x.description || ''}${x.order_number ? ` · sipariş ${x.order_number}` : ''}</div></td>
          <td class="r num" style="font-weight:650">${money(x.amount)}</td>
          <td class="r">${/^https?:\/\//i.test(x.url || '') ? html`<a class="btn sm" href="${x.url}" target="_blank" rel="noopener"><i class="ico ico-download"></i>PDF</a>` : ''}</td></tr>`)}
      </tbody></table></div>${inv.total > inv.items.length ? html`<div class="pager"><span class="muted small">İlk ${n(inv.items.length)} fatura gösteriliyor</span></div>` : ''}`
      : html`<div class="empty">Bu dönemde fatura yok${isAdmin() ? ' — “Faturaları çek” ile kanallardan alın' : ''}</div>`}
      <div class="muted tiny" style="padding:0 16px 14px">Faturalar ${inv.supported.map((c) => ch(c).name).join(', ')} finans servisinden alınır ve panelde saklanır (6 saatte bir güncellenir). PDF bağlantısı kanal veriyorsa gösterilir.</div>`);
  }
  // Ürünlere göre kârlılık (en çok kazandıran / zarar ettiren / en çok iade edilen)
  let prod = null, exp = null;
  const PSORT = [['profit', 'En çok kazandıran'], ['loss', 'Zarar ettiren'], ['revenue', 'En çok ciro'], ['margin', 'Marj'], ['returns', 'En çok iade']];
  function drawProducts() {
    const box = $('[data-prod]', el);
    const head = html`<div class="card-pad card-head" style="flex-wrap:wrap;gap:8px"><div style="flex:1;min-width:220px"><h2>Ürünlere göre kârlılık</h2><div class="muted small">${prod ? `${n(prod.total)} ürün satıldı${prod.losing ? ` · ${n(prod.losing)} ürün zararına` : ''}${prod.noCost ? ` · ${n(prod.noCost)} ürünün alış fiyatı yok` : ''}` : ''}</div></div>
      <div class="chips">${PSORT.map(([k, t]) => html`<button class="chip ${f.psort === k ? 'on' : ''}" data-act="psort" data-k="${k}">${t}</button>`)}</div></div>`;
    if (!prod) return render(box, html`${head}<div class="empty"><i class="ico ico-sync spin"></i></div>`);
    const rows = prod.rows.slice(0, f.pall ? 300 : 15);
    render(box, html`${head}${rows.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Ürün</th><th class="r">Adet</th><th class="r">Ciro</th><th class="r">Komisyon</th><th class="r" title="Kargo, hizmet bedeli, ek kesinti ve stopajın satır payı">Diğer kesinti</th><th class="r">Alış</th><th class="r">Kâr</th><th class="r">İade</th></tr></thead><tbody>
      ${rows.map((x) => html`<tr><td><div class="row" style="gap:10px;min-width:220px">${thumb(x.image, x.name, 'sm')}<div style="min-width:0"><div class="ellipsis" style="font-weight:650;max-width:320px">${x.name}${x.variant ? html` <span class="muted">· ${x.variant}</span>` : ''}</div>
          <div class="tiny muted">${x.channels.map((c) => chLogo(c, true))} ${x.missingCost ? html`<span class="pill warn tiny">alış fiyatı yok</span>` : `birim kâr ${money(x.unitProfit)}`}</div></div></div></td>
        <td class="r num">${n(x.units)}</td><td class="r num">${money0(x.revenue)}</td><td class="r num">${money0(x.commission)}</td><td class="r num">${money0(x.other)}</td><td class="r num">${x.missingCost ? '—' : money0(x.cost)}</td>
        <td class="r num" style="font-weight:750;color:${x.profit >= 0 ? 'var(--good)' : 'var(--bad)'}">${money0(x.profit)}<div class="tiny muted">%${n(x.margin)}</div></td>
        <td class="r num">${x.returns ? html`${n(x.returns)}<div class="tiny ${x.returnRate >= 10 ? 'neg' : 'muted'}">%${n(x.returnRate)}</div>` : html`<span class="muted">—</span>`}</td></tr>`)}
      </tbody></table></div>${prod.rows.length > rows.length ? html`<div class="pager"><button class="btn sm" data-act="pall">Tümünü göster (${n(prod.rows.length)})</button></div>` : ''}
      <div class="muted tiny" style="padding:0 16px 14px">Sipariş başı giderler (kargo, hizmet bedeli, ek kesinti, stopaj) siparişteki ürünlere ciro payına göre dağıtılır. Reklam, ceza ve işletme giderleri ürünlere dağıtılmaz.</div>`
      : html`<div class="empty">Bu dönemde satış yok</div>`}`);
  }
  // İşletme giderleri: kira, personel, paketleme … (tek seferlik ya da her ay)
  function drawExpenses() {
    const box = $('[data-exp]', el), ro = viewOnly(state.user, 'finance');
    const head = html`<div class="card-pad card-head" style="flex-wrap:wrap;gap:8px"><div style="flex:1;min-width:220px"><h2>İşletme giderleri</h2><div class="muted small">Pazaryeri dışındaki giderleriniz; net kârdan düşülür${f.channel ? ' (tek kanal seçiliyken hesaba katılmaz)' : ''}</div></div>
      ${ro ? '' : html`<button class="btn sm primary" data-act="expadd"><i class="ico ico-plus"></i>Gider ekle</button>`}</div>`;
    if (!exp) return render(box, html`${head}<div class="empty"><i class="ico ico-sync spin"></i></div>`);
    const cats = (d && d.expenses) || [];
    render(box, html`${head}
      ${cats.length ? html`<div class="row wrap" style="gap:8px;padding:0 16px 12px">${cats.map((x) => html`<span class="chip">${x.category} <b class="num" style="margin-left:4px">${money0(x.amount)}</b></span>`)}<span class="muted small" style="align-self:center">bu dönemde</span></div>` : ''}
      ${exp.items.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Gider</th><th>Tür</th><th>Tarih</th><th class="r">Tutar</th><th></th></tr></thead><tbody>
        ${exp.items.map((x) => html`<tr data-id="${x.id}"><td><div style="font-weight:650">${x.title}</div>${x.note ? html`<div class="tiny muted">${x.note}</div>` : ''}</td><td><span class="pill">${x.category}</span></td>
          <td class="small" style="white-space:nowrap">${x.recurring === 'monthly' ? html`<span class="pill info tiny">her ay</span> ${date(x.date)}'den${x.until ? ` ${date(x.until)}'e` : ''}` : date(x.date)}</td>
          <td class="r num" style="font-weight:650">${money(x.amount)}${x.recurring === 'monthly' ? html`<span class="tiny muted"> /ay</span>` : ''}</td>
          <td class="r">${ro ? '' : html`<div class="row" style="justify-content:flex-end;gap:6px"><button class="btn sm" data-act="expedit">Düzenle</button><button class="btn sm ghost" data-act="expdel" aria-label="Sil"><i class="ico ico-x"></i></button></div>`}</td></tr>`)}
      </tbody></table></div>` : html`<div class="empty">Henüz gider girilmedi. Kira, personel, paketleme gibi giderleri ekleyin; net kâr doğru hesaplansın.</div>`}
      <div class="muted tiny" style="padding:0 16px 14px">Aylık giderler seçilen döneme gün bazında yayılır (ör. "Bu ay" ayın 10'unda açılırsa kiranın 10 günlük payı).</div>`);
  }
  function expenseForm(x = null) {
    const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10), day = (ms) => (ms ? new Date(ms + 3 * 3600e3).toISOString().slice(0, 10) : '');
    const s = sheet({
      title: x ? 'Gideri düzenle' : 'Gider ekle', size: 'narrow',
      body: html`<div class="stack">
        <label class="field"><span>Gider adı</span><input class="input" data-e="title" value="${x ? x.title : ''}" placeholder="ör. Depo kirası"></label>
        <div class="row" style="gap:10px"><label class="field" style="flex:1"><span>Tür</span><select class="input" data-e="category">${exp.categories.map((c) => html`<option ${x && x.category === c ? 'selected' : ''}>${c}</option>`)}</select></label>
          <label class="field" style="flex:1"><span>Tutar (₺)</span><input class="input" data-e="amount" inputmode="decimal" value="${x ? x.amount : ''}"></label></div>
        <div class="row" style="gap:10px"><label class="field" style="flex:1"><span>Sıklık</span><select class="input" data-e="recurring"><option value="">Tek seferlik</option><option value="monthly" ${x && x.recurring === 'monthly' ? 'selected' : ''}>Her ay</option></select></label>
          <label class="field" style="flex:1"><span data-dl>${x && x.recurring === 'monthly' ? 'Başlangıç' : 'Tarih'}</span><input class="input" type="date" data-e="date" value="${x ? day(x.date) : today}"></label></div>
        <label class="field" data-untilf style="${x && x.recurring === 'monthly' ? '' : 'display:none'}"><span>Bitiş (isteğe bağlı)</span><input class="input" type="date" data-e="until" value="${x ? day(x.until) : ''}"></label>
        <label class="field"><span>Not (isteğe bağlı)</span><input class="input" data-e="note" value="${x ? x.note || '' : ''}"></label>
      </div>`,
      foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>Kaydet</button>`,
    });
    const v = (k) => $(`[data-e=${k}]`, s.el).value.trim();
    $('[data-e=recurring]', s.el).onchange = () => { const m = v('recurring') === 'monthly'; $('[data-untilf]', s.el).style.display = m ? '' : 'none'; $('[data-dl]', s.el).textContent = m ? 'Başlangıç' : 'Tarih'; };
    $('[data-save]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
      const ms = (d) => (d ? Date.parse(d + 'T00:00:00+03:00') : null);
      const b = { title: v('title'), category: v('category'), amount: v('amount'), recurring: v('recurring'), date: ms(v('date')) || Date.now(), until: ms(v('until')), note: v('note') };
      await api(x ? `expenses/${x.id}` : 'expenses', { method: x ? 'PUT' : 'POST', body: b });
      s.close(); toast('Gider kaydedildi'); await load();
    });
  }
  // Hakediş: pazaryerinin ödeme günleri (ödenen / ödenecek), kayıt türleri ve mutabakat (pazaryeri hakedişi ≠ panel tahmini)
  let stl = null;
  function drawSettlements() {
    const box = $('[data-stl]', el);
    if (!stl) return render(box, html`<div class="card-pad"><h2>Hakediş</h2></div><div class="empty"><i class="ico ico-sync spin"></i></div>`);
    const t = stl.totals, today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
    render(box, html`<div class="card-pad card-head" style="flex-wrap:wrap;gap:8px"><div style="flex:1;min-width:220px"><h2>Hakediş</h2><div class="muted small">Pazaryerinin hesap ekstresinden: ödeme günleri, ödenen ve ödenecek tutarlar</div></div>
        ${isAdmin() ? html`<button class="btn sm" data-act="stlsync"><i class="ico ico-sync"></i>Hakedişi çek</button>` : ''}</div>
      ${!stl.supported.length && !stl.days.length ? html`<div class="empty">Hakediş bilgisi veren bağlı kanal yok (Trendyol, Hepsiburada).</div>` : html`
      <div class="kpis" style="padding:0 16px 12px">
        <div class="kpi"><div class="label">Ödenecek (vadesi gelmemiş)</div><div class="value num">${money0(t.upcoming - t.overdue)}</div></div>
        <div class="kpi"><div class="label">Vadesi geçmiş, ödenmemiş</div><div class="value num" style="color:${t.overdue ? 'var(--bad)' : 'inherit'}">${money0(t.overdue)}</div></div>
        <div class="kpi"><div class="label">Dönemde ödenen</div><div class="value num">${money0(t.paid)}</div></div>
        <div class="kpi"><div class="label">Mutabakat</div><div class="value num" style="color:${t.mismatched ? 'var(--amber, #b45309)' : 'var(--good)'}">${t.mismatched ? `${n(t.mismatched)} fark` : 'uyumlu'}</div><div class="delta flat">${n(t.checked)} sipariş karşılaştırıldı</div></div>
      </div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Ödeme günü</th><th>Kanal</th><th class="r">Ödenen</th><th class="r">Ödenecek</th><th class="r">Kayıt</th></tr></thead><tbody>
        ${stl.days.slice(0, 40).map((x) => html`<tr><td class="small" style="white-space:nowrap">${x.d.split('-').reverse().join('.')}${x.d > today ? html` <span class="pill info" style="font-size:11px">ileri</span>` : x.due && x.d < today ? html` <span class="pill bad" style="font-size:11px">gecikti</span>` : ''}</td>
          <td>${chLogo(x.channel, true)}</td><td class="r num">${x.paid ? money(x.paid) : '—'}</td><td class="r num" style="font-weight:650">${x.due ? money(x.due) : '—'}</td><td class="r num muted">${n(x.n)}</td></tr>`)}
        ${!stl.days.length ? html`<tr><td colspan="5" class="empty">Kayıt yok${isAdmin() ? ' — “Hakedişi çek” ile alın' : ''}</td></tr>` : ''}
      </tbody></table></div>
      ${stl.types.length ? html`<div class="row wrap" style="gap:8px;padding:12px 16px">${stl.types.map((x) => html`<span class="chip">${x.type} <b class="num" style="margin-left:4px;color:${x.amount < 0 ? 'var(--bad)' : 'inherit'}">${money0(x.amount)}</b></span>`)}</div>` : ''}
      ${stl.diffs.length ? html`<details style="padding:0 16px 14px"><summary style="cursor:pointer;font-weight:650">Mutabakat farkları (${n(stl.diffs.length)}) — pazaryerinin hakedişi panelin tahmininden farklı olan siparişler</summary>
        <div class="table-wrap" style="margin-top:8px"><table class="t"><thead><tr><th>Sipariş</th><th class="r">Panel tahmini</th><th class="r">Pazaryeri hakedişi</th><th class="r">Fark</th></tr></thead><tbody>
        ${stl.diffs.map((x) => html`<tr><td>${chLogo(x.channel, true)} <b>#${x.order_number}</b> <span class="muted tiny">${date(x.ordered_at)}</span></td><td class="r num">${money(x.expected)}</td><td class="r num">${money(x.actual)}</td>
          <td class="r num" style="font-weight:700;color:${x.diff < 0 ? 'var(--bad)' : 'var(--good)'}">${x.diff > 0 ? '+' : ''}${money(x.diff)}</td></tr>`)}
        </tbody></table></div><div class="muted tiny" style="margin-top:6px">Tahmin: satış − komisyon (kargo ve diğer kesintiler pazaryerinde ayrı faturalanır). Farklar genelde kampanya indirimi, farklı komisyon oranı ya da kısmi iadeden kaynaklanır.</div></details>` : ''}`}`);
  }
  async function load() {
    store.set('finance', { range: f.range });
    setQuery({ channel: f.channel });
    const [from, to] = span();
    const p = new URLSearchParams({ from, to });
    if (f.channel) p.set('channel', f.channel);
    inv = null; prod = null;
    [d, exp] = await Promise.all([api('finance?' + p), api('expenses').catch(() => ({ items: [], categories: [] }))]);
    draw(); drawProducts(); drawExpenses();
    api('finance/products?' + new URLSearchParams([...p, ['sort', f.psort]])).then((r) => { prod = r; drawProducts(); }).catch(() => { prod = { rows: [], total: 0 }; drawProducts(); });
    if (f.itype) p.set('type', f.itype);
    stl = null; drawSettlements();
    [inv, stl] = await Promise.all([
      api('invoices?' + p).catch((e) => ({ items: [], types: [], supported: [], total: 0, sum: 0, error: e.message })),
      api('settlements?' + new URLSearchParams([...p].filter(([k]) => k !== 'type'))).catch(() => ({ totals: { paid: 0, upcoming: 0, overdue: 0, checked: 0, mismatched: 0 }, days: [], types: [], diffs: [], supported: [] })),
    ]);
    drawInvoices(); drawSettlements();
  }
  const refresh = () => load().catch((e) => toast(e.message, true));
  actions(el, {
    ch: (t) => { f.channel = t.dataset.id; refresh(); },
    range: (t) => { f.range = t.dataset.k; refresh(); },
    itype: (t) => { f.itype = t.dataset.k; refresh(); },
    psort: async (t) => { f.psort = t.dataset.k; prod = null; drawProducts(); const [from, to] = span(); prod = await api('finance/products?' + new URLSearchParams({ from, to, sort: f.psort, ...(f.channel ? { channel: f.channel } : {}) })); drawProducts(); },
    pall: () => { f.pall = true; drawProducts(); },
    expadd: () => expenseForm(),
    expedit: (t) => expenseForm(exp.items.find((x) => x.id === Number(t.closest('tr').dataset.id))),
    expdel: async (t) => { const x = exp.items.find((y) => y.id === Number(t.closest('tr').dataset.id)); if (x && (await confirmBox(`"${x.title}" gideri silinsin mi?`, 'Sil'))) { await api(`expenses/${x.id}`, { method: 'DELETE' }); await load(); } },
    stlsync: (t) => busy(t, async () => { const r = await api('settlements/sync', { method: 'POST' }); toast(Object.entries(r).map(([k, v]) => `${ch(k).name}: ${typeof v === 'string' ? v : `${v} kayıt`}`).join(' · ') || 'Hakediş bilgisi veren kanal yok'); await load(); }),
    invsync: (t) => busy(t, async () => { const r = await api('invoices/sync', { method: 'POST' }); toast(Object.entries(r.invoices || r).map(([k, v]) => `${ch(k).name}: ${typeof v === 'string' ? v : `${v} fatura`}${r.costs && typeof r.costs[k] === 'number' ? `, ${r.costs[k]} siparişe kargo` : ''}`).join(' · ') || 'Fatura bilgisi veren kanal yok'); await load(); }),
  });
  await refresh();
  return { refresh };
}
