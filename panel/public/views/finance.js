// Gelir & Gider: seçilen dönemde satıştan kâra masraf basamakları (komisyon, kargo, hizmet bedeli, ek kesinti, stopaj, alış),
// kanal bazında tablo, hakediş (ödeme günleri, ödenen / ödenecek, mutabakat) ve pazaryerlerinin kestiği faturalar.
import { api, locked, html, render, $, $$, money, money0, n, ch, chLogo, chBadge, date, dateTime, store, toast, actions, busy, activeChannels, isAdmin, sheet, confirmBox, thumb, state } from '../core.js';
import { costBtn } from '../costedit.js';
import { viewOnly } from '../perms.js';
import { setQuery } from '../app.js';
import { customBox, customSpan, bindCustom } from '../daterange.js';

const D = 864e5;
const startOfMonth = (k = 0) => { const d = new Date(Date.now() + 3 * 3600e3); d.setUTCDate(1); d.setUTCHours(0, 0, 0, 0); d.setUTCMonth(d.getUTCMonth() - k); return d.getTime() - 3 * 3600e3; };
const RANGES = [
  ['month', 'Bu ay', () => [startOfMonth(0), Date.now() + 1]],
  ['last', 'Geçen ay', () => [startOfMonth(1), startOfMonth(0)]],
  ['30', 'Son 30 gün', () => [Date.now() - 30 * D, Date.now() + 1]],
  ['90', 'Son 90 gün', () => [Date.now() - 90 * D, Date.now() + 1]],
  ['year', 'Son 1 yıl', () => [Date.now() - 365 * D, Date.now() + 1]],
  ['custom', 'Özel tarih', (f) => customSpan(f)],
];

export async function financeView(el, rest, query = {}) {
  const f = { range: 'month', psort: 'profit', channel: query.channel || '', ...store.get('finance', {}), ...(query.channel ? { channel: query.channel } : {}) };
  // Genel bakıştaki "Zarar ettiren ürünler" kartından: ?urun=zarar&donem=30 → ürün tablosu "Zarar ettiren", son 30 gün, tabloya kaydırılır
  const PS_Q = { zarar: 'loss', iade: 'retcost' };
  let jump = PS_Q[query.urun];
  if (jump) f.psort = jump;
  if (['month', 'last', '30', '90', 'year'].includes(query.donem)) f.range = query.donem;
  let d = null, inv = null;
  render(el, html`<div class="stack">
    <div class="ch-tabs" data-chs></div>
    <div class="row wrap" style="align-items:center"><b style="margin-right:6px">Dönem:</b><div class="chips" data-ranges></div><span class="muted small" data-rlabel></span><span class="spacer"></span><button class="btn sm" data-health title="Komisyon, hakediş ve kargo verilerinin tutarlılığı"><i class="ico ico-check"></i>Veri sağlık kontrolü</button></div>
    <div class="kpis" data-kpis></div>
    <div class="stack">
      <div class="card"><div class="card-head"><h2>Masraf basamakları</h2><span class="muted small">satıştan kâra</span></div><div data-steps></div></div>
      <div class="card flush"><div class="card-pad card-head"><h2>Kanallara göre</h2></div><div data-chtable></div></div>
    </div>
    <div class="card flush" data-comm></div>
    <div class="card flush" data-prod></div>
    <div class="card flush" data-exp></div>
    <div class="card flush" data-stl></div>
    <div class="card flush"><div class="card-pad card-head" style="flex-wrap:wrap;gap:8px"><h2>Kesilen faturalar</h2><span class="muted small" data-invsub></span><span class="spacer"></span>
      ${isAdmin() ? html`<button class="btn sm" data-act="invsync"><i class="ico ico-sync"></i>Faturaları ve kargo giderini çek</button>` : ''}</div><div data-inv></div></div>
  </div>`);

  $('[data-health]', el).onclick = async () => (await import('./health.js')).healthSheet();
  const span = () => (RANGES.find((r) => r[0] === f.range) || RANGES[0])[2](f);
  function draw() {
    const chs = activeChannels().filter((c) => c.enabled || c.demo);
    render($('[data-chs]', el), html`<button class="ch-tab ${!f.channel ? 'on' : ''}" data-act="ch" data-id=""><i class="ico ico-grid"></i>Tüm kanallar</button>${chs.map((c) => html`<button class="ch-tab ${f.channel === c.id ? 'on' : ''}" data-act="ch" data-id="${c.id}">${chLogo(c.id)}${c.name}</button>`)}`);
    render($('[data-ranges]', el), html`${RANGES.map(([k, t]) => html`<button class="chip ${f.range === k ? 'on' : ''}" data-act="range" data-k="${k}">${t}</button>`)}${customBox(f)}`);
    $('[data-rlabel]', el).textContent = `${date(d.from)} – ${date(Math.min(d.to, Date.now()) - 1)}`;
    const t = d.total, ded = t.commission - (t.commCredit || 0) + t.shipping + t.fee + t.rateFee + t.withholding + t.ads + t.penalty + t.returnLoss, net = f.channel ? t.profit : t.net;
    render($('[data-kpis]', el), html`
      <div class="kpi"><div class="label">Satış (ciro)</div><div class="value num">${money0(t.revenue)}</div><div class="delta flat">${n(t.orders)} sipariş</div></div>
      <div class="kpi"><div class="label">Pazaryeri kesintileri</div><div class="value num">${money0(ded)}</div><div class="delta flat">satışın %${n(t.revenue ? (ded / t.revenue) * 100 : 0)}'i</div></div>
      <div class="kpi"><div class="label">Hakediş</div><div class="value num">${money0(t.payout)}</div><div class="delta flat">hesabınıza geçen</div></div>
      <div class="kpi"><div class="label">${f.channel ? 'Brüt kâr' : net >= 0 ? 'Net kâr' : 'Net zarar'}</div><div class="value num" style="color:${net >= 0 ? 'var(--good)' : 'var(--bad)'}">${money0(net)}</div><div class="delta flat">${f.channel ? `kâr marjı %${n(t.margin)}` : `brüt ${money0(t.profit)} − işletme ${money0(t.expenses)}`}</div></div>`);
    const max = Math.max(1, ...d.steps.map((s) => Math.abs(s.v)));
    render($('[data-steps]', el), t.orders ? html`<div class="stack" style="gap:8px">${d.steps.map((s) => html`<div class="fin-step" style="${s.sum ? 'border-top:1px solid var(--line);padding-top:8px' : ''}">
        <div style="min-width:0"><div class="small" style="font-weight:${s.sum || s.k === 'revenue' ? 750 : 550}">${s.label}</div>${s.note ? html`<div class="tiny muted">${s.note}</div>` : ''}</div>
        <div class="bar" style="background:var(--surface-3);border-radius:6px;height:14px;overflow:hidden"><div style="height:100%;width:${(Math.abs(s.v) / max) * 100}%;border-radius:6px;background:${s.info ? 'var(--muted)' : s.v < 0 ? 'var(--bad)' : s.k === 'profit' || s.k === 'net' ? 'var(--good)' : 'var(--primary)'};opacity:${s.info ? 0.4 : s.sum || s.k === 'revenue' ? 1 : 0.7}"></div></div>
        <span class="amt num${s.info ? ' muted' : ''}" style="color:${s.info ? 'inherit' : s.v < 0 ? 'var(--bad)' : s.k === 'net' ? 'var(--good)' : 'inherit'};${s.k === 'net' ? 'font-weight:800' : ''}">${s.info ? '(' : ''}${s.v < 0 ? '−' : s.k === 'commCredit' ? '+' : ''}${money(Math.abs(s.v))}${s.info ? ')' : ''}</span>
        <span class="pct muted tiny" style="text-align:right">%${n(t.revenue ? (Math.abs(s.v) / t.revenue) * 100 : 0)}</span></div>`)}</div>
      <div class="muted tiny" style="margin-top:10px">Kesinti oranları Ayarlar → Giderler'den gelir; kanal gerçek komisyon, kargo ve hizmet bedelini bildirdiyse o kullanılır. Reklam, ceza ve kesinti faturaları pazaryerinin kestiği faturalardan (fatura tarihine göre) alınır.</div>`
      : html`<div class="empty">Bu dönemde sipariş yok</div>`);
    render($('[data-chtable]', el), d.channels.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Kanal</th><th class="r">Satış</th><th class="r">Komisyon</th><th class="r">Kargo</th><th class="r">Hizmet + ek</th><th class="r">Stopaj</th><th class="r" title="Reklam, ceza ve iade kaybı">Reklam / ceza / iade</th><th class="r">Hakediş</th><th class="r">Kâr</th></tr></thead><tbody>
      ${d.channels.map((c) => html`<tr><td>${chBadge(c.channel)}<div class="tiny muted">${n(c.orders)} sipariş</div></td><td class="r num">${money0(c.revenue)}</td><td class="r num">${money0(c.commission)}</td><td class="r num">${money0(c.shipping)}<div class="tiny muted" title="${c.shippingError ? 'Kargo gideri okunamadı: ' + c.shippingError : ''}">${c.shippingError && !['api', 'invoice'].includes(c.shippingSrc) ? html`<span style="color:var(--warn)">fatura okunamadı</span>` : { api: 'fatura', mixed: 'fatura + ürün / ayar', invoice: 'fatura toplamı', product: 'ürüne girilen', default: 'Ayarlar → Giderler', none: 'girilmedi' }[c.shippingSrc] || ''}</div></td>
        <td class="r num">${money0(c.fee + c.rateFee)}</td><td class="r num">${money0(c.withholding)}</td><td class="r num">${money0(c.ads + c.penalty + c.returnLoss + (c.returnDamaged || 0))}${c.returns ? html`<div class="tiny muted">${n(c.returns)} iade · ${money0(c.returnLoss + (c.returnDamaged || 0))}</div>` : ''}</td><td class="r num" style="font-weight:650">${money0(c.payout)}</td>
        <td class="r num" style="font-weight:750;color:${c.profit >= 0 ? 'var(--good)' : 'var(--bad)'}">${money0(c.profit)}<div class="tiny muted">%${n(c.margin)}</div></td></tr>`)}
    </tbody></table></div>` : html`<div class="empty">Veri yok</div>`);
    drawInvoices();
  }
  function drawInvoices() {
    const box = $('[data-inv]', el);
    if (!inv) return render(box, html`<div class="empty"><i class="ico ico-sync spin"></i></div>`);
    if (inv.locked) return render(box, html`<div class="notice small" style="margin:12px"><i class="ico ico-key"></i><div><b>${'Kesilen faturalar'} Profesyonel ve Kurumsal pakette.</b> Pazaryerinin kestiği faturalar ve hakediş ödemeleri burada görünür. <a class="link" href="#/paketim">Paketim</a>'den yükseltebilirsiniz.</div></div>`);
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
  // Komisyon kontrolü (Trendyol / Hepsiburada): pazaryerinin komisyon indirimi, sonradan geri verdiği komisyon ve resmî listeyle sağlama
  let comm = null;
  function drawCommission() {
    const box = $('[data-comm]', el);
    const head = html`<div class="card-pad card-head" style="flex-wrap:wrap;gap:8px"><div style="flex:1;min-width:220px"><h2>Komisyon kontrolü</h2><div class="muted small">Trendyol ve Hepsiburada · tutarlar KDV dahil (cebinizden çıkan)</div></div></div>`;
    if (!comm) return render(box, html`${head}<div class="empty"><i class="ico ico-sync spin"></i></div>`);
    if (comm.error || !comm.supported) return render(box, html`${head}<div class="empty">${comm.error || 'Komisyon kontrolü Trendyol ve Hepsiburada için yapılır.'}</div>`);
    const dsc = comm.discounts, cr = comm.credits, L = comm.list, src = (x) => (x.ref === 'list' ? 'resmî liste' : 'olağan');
    const srcs = Object.entries(L.sources || {}).map(([k, v]) => `${ch(k).name}: ${v.title || 'resmî liste'} (${v.published.split('-').reverse().join('.')}${v.basis === 'kdv-haric' ? ', oran KDV hariç → ×1,20' : ', oran KDV dahil'})`).join(' · ');
    render(box, html`${head}
      <div class="kpis" style="padding:0 16px 12px">
        <div class="kpi"><div class="label">Pazaryeri komisyon indirimi</div><div class="value num" style="color:${dsc.amount ? 'var(--good)' : 'inherit'}">${money0(dsc.amount)}</div><div class="delta flat">${dsc.orders ? `${n(dsc.orders)} sipariş, ${n(dsc.lines)} satır` : 'bu dönemde yok'}</div></div>
        <div class="kpi"><div class="label">Komisyon iadesi (pazaryeri karşıladı)</div><div class="value num" style="color:${cr.amount > 0 ? 'var(--good)' : 'inherit'}">${money0(cr.amount)}</div><div class="delta flat">${cr.orders ? `${n(cr.orders)} sipariş · kâra eklendi` : 'hakediş kayıtlarında yok'}</div></div>
        <div class="kpi"><div class="label">Listeden yüksek oran</div><div class="value num" style="color:${L.aboveCount ? 'var(--bad)' : 'var(--good)'}">${n(L.aboveCount)}</div><div class="delta flat">${n(L.matched)}/${n(L.total)} ilan resmî listeyle eşleşti</div></div>
      </div>
      ${dsc.top.length ? html`<details style="padding:4px 16px"><summary style="cursor:pointer;font-weight:650">İndirimli komisyonlu satırlar (${n(dsc.lines)})</summary>
        <div class="muted tiny" style="margin:6px 0">Satırın gerçek komisyon oranı, ürünün olağan oranından (son 90 günün ortancası) ya da resmî listedeki orandan en az 1 puan düşük: farkı pazaryeri karşıladı. Bu indirim komisyon satırında zaten düşük kesildi; kâra ayrıca eklenmez.</div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Sipariş</th><th class="r">Normal</th><th class="r">Kesilen</th><th class="r">Kazancınız</th></tr></thead><tbody>
        ${dsc.top.map((x) => html`<tr><td><div>${chLogo(x.channel, true)} <a class="link" href="#/siparisler/${encodeURIComponent(x.id)}"><b>#${x.order_number}</b></a> <span class="muted tiny">${date(x.ordered_at)}</span></div><div class="tiny muted ellipsis" style="max-width:340px">${x.name || ''}</div></td>
          <td class="r num">%${n(x.normal)}<div class="tiny muted">${src(x)}</div></td><td class="r num">%${n(x.rate)}</td><td class="r num" style="font-weight:650;color:var(--good)">${money(x.saved)}</td></tr>`)}
        </tbody></table></div></details>` : ''}
      ${L.above.length ? html`<details style="padding:4px 16px"><summary style="cursor:pointer;font-weight:650;color:var(--bad)">Resmî listeden yüksek komisyon (${n(L.aboveCount)} ilan)</summary>
        <div class="muted tiny" style="margin:6px 0">Pazaryerinin siparişte bildirdiği oran, kategorinin resmî liste oranından 0,5 puandan fazla yüksek. Kategori eşleşmesi, KDV farkı ya da hatalı oran olabilir; pazaryeri panelinden kontrol edin.</div>
        <div class="table-wrap"><table class="t"><thead><tr><th>İlan</th><th class="r">Kanal oranı</th><th class="r">Liste</th><th class="r">Fark</th></tr></thead><tbody>
        ${L.above.map((x) => html`<tr><td><div>${chLogo(x.channel, true)} ${x.product_id ? html`<a class="link" href="#/urunler/${x.product_id}">${x.name || x.remote_id}</a>` : x.name || x.remote_id}</div><div class="tiny muted ellipsis" style="max-width:360px" title="${x.path}">${x.category} → ${x.path}</div></td>
          <td class="r num">%${n(x.rate)}</td><td class="r num">%${n(x.list)}</td><td class="r num" style="font-weight:650;color:var(--bad)">+${n(x.gap)} puan</td></tr>`)}
        </tbody></table></div></details>` : ''}
      <div class="muted tiny" style="padding:8px 16px 14px">Komisyon iadesi: pazaryerinin hakediş ekstresindeki komisyon düzeltmeleri (Trendyol "Komisyon düzeltme", Hepsiburada komisyon iadesi); panelin saydığı komisyona zaten yansımış kısmı (ör. kısmi iade) ikinci kez eklenmez. Resmî liste: ${srcs}. Kategori adı listede tek anlamlı eşleşen ilanlar karşılaştırılır (${n(L.withCategory)} ilanın pazaryeri kategorisi biliniyor); oranı bilinmeyen ${n(L.fallback)} ilanda tahmin için liste oranı kullanılıyor.</div>`);
  }
  // Ürünlere göre kârlılık (en çok kazandıran / zarar ettiren / en çok iade edilen)
  let prod = null, exp = null;
  const PSORT = [['profit', 'En çok kazandıran'], ['loss', 'Zarar ettiren'], ['revenue', 'En çok ciro'], ['margin', 'Marj'], ['returns', 'En çok iade'], ['retcost', 'En çok iade maliyeti']];
  function drawProducts() {
    const box = $('[data-prod]', el);
    const head = html`<div class="card-pad card-head" style="flex-wrap:wrap;gap:8px"><div style="flex:1;min-width:220px"><h2>Ürünlere göre kârlılık</h2><div class="muted small">${prod ? html`${n(prod.total)} ürün satıldı${prod.losing ? html` · <b class="neg">${n(prod.losing)} ürün zararına (${money0(prod.lossTotal)})</b>` : ''}${prod.returnCost ? ` · iade maliyeti ${money0(prod.returnCost)}${prod.returnEst ? ` (${money0(prod.returnEst)} tahmini)` : ''}` : ''}${prod.noCost ? ` · ${n(prod.noCost)} ürünün alış fiyatı yok` : ''}` : ''}</div></div>
      <div class="chips">${PSORT.map(([k, t]) => html`<button class="chip ${f.psort === k ? 'on' : ''}" data-act="psort" data-k="${k}">${t}</button>`)}</div></div>`;
    if (!prod) return render(box, html`${head}<div class="empty"><i class="ico ico-sync spin"></i></div>`);
    const rows = prod.rows.slice(0, f.pall ? 300 : 15);
    render(box, html`${head}${rows.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Ürün</th><th class="r">Adet</th><th class="r">Ciro</th><th class="r">Komisyon</th><th class="r" title="Kargo, hizmet bedeli, ek kesinti ve stopajın satır payı">Diğer kesinti</th><th class="r">Alış</th><th class="r" title="Geri gelmeyen gönderim kargosu, iade kargosu, geri verilmeyen komisyon / hizmet bedeli (ve açıksa hasarlı iadenin alış maliyeti)">İade maliyeti</th><th class="r" title="İade maliyeti düşüldükten sonraki gerçek kâr">Kâr (iade dahil)</th><th class="r">İade</th></tr></thead><tbody>
      ${rows.map((x) => html`<tr><td><div class="row" style="gap:10px;min-width:220px">${thumb(x.image, x.name, 'sm')}<div style="min-width:0"><div class="ellipsis" style="font-weight:650;max-width:320px">${x.name}${x.variant ? html` <span class="muted">· ${x.variant}</span>` : ''}</div>
          <div class="tiny muted">${x.channels.map((c) => chLogo(c, true))} ${x.missingCost ? costBtn(x.product_id, x.name) : `birim kâr ${money(x.unitProfit)}`}</div></div></div></td>
        <td class="r num">${n(x.units)}</td><td class="r num">${money0(x.revenue)}</td><td class="r num">${money0(x.commission)}</td><td class="r num">${money0(x.other)}</td><td class="r num">${x.missingCost ? '—' : money0(x.cost)}</td>
        <td class="r num">${x.returnCost ? html`<span class="${x.returnShare == null || x.returnShare > 30 ? 'neg' : ''}">${money0(x.returnCost)}</span><div class="tiny muted" title="${x.estReturn ? `${money(x.estReturn)} tahmini (ürün kargo tutarından ya da Ayarlar'daki kargo / hizmet bedeli tutarlarından)` : 'kargo faturasından'}">${money(x.perReturn)} / iade${x.estReturn ? ' · tahmini' : ''}</div>` : html`<span class="muted">—</span>`}</td>
        <td class="r num" style="font-weight:750;color:${x.profit >= 0 ? 'var(--good)' : 'var(--bad)'}">${money0(x.profit)}<div class="tiny muted">%${n(x.margin)}${x.returnCost ? html` · iade hariç ${money0(x.profitExRet)}` : ''}</div></td>
        <td class="r num">${x.returns ? html`${n(x.returns)}<div class="tiny ${x.returnRate >= 10 ? 'neg' : 'muted'}">%${n(x.returnRate)}</div>` : html`<span class="muted">—</span>`}</td></tr>`)}
      </tbody></table></div>${prod.rows.length > rows.length ? html`<div class="pager"><button class="btn sm" data-act="pall">Tümünü göster (${n(prod.rows.length)})</button></div>` : ''}
      <div class="muted tiny" style="padding:0 16px 14px">Sipariş başı giderler (kargo, hizmet bedeli, ek kesinti, stopaj) siparişteki ürünlere ciro payına göre dağıtılır. İade maliyeti: iade edilen siparişte geri gelmeyen gönderim kargosu, iade kargosu (kargo faturasından; yoksa Ayarlar → Giderler'deki tahmini iade kargo bedeli, o da boşsa tahmini (ürün kargo tutarından)), geri verilmeyen komisyon ve hizmet bedeli; iade edilen ürünlere iade tutarı payına göre dağıtılır. Reklam, ceza ve işletme giderleri ürünlere dağıtılmaz.</div>`
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
  const dmy = (d) => String(d || '').split('-').reverse().join('.');
  // Mutabakat farkının tarafı ve sipariş ayrıntısı (pazaryeri kayıtları ↔ panelin beklediği)
  const SIDE_PILL = { panel: ['info', 'Panel / veri'], short: ['bad', 'Eksik ödeme?'], extra: ['warn', 'Fazla ödeme?'], wait: ['', 'Bekleniyor'] };
  const sidePill = (k) => { const [c, l] = SIDE_PILL[k] || SIDE_PILL.panel; return html`<span class="pill tiny ${c}" style="padding:2px 8px">${l}</span>`; };
  const RAW_KEYS = ['status', 'amount', 'netAmount', 'taxAmount', 'isIncome', 'isInvoice', 'packageNumber', 'orderItemNumber', 'invoiceNumber', 'quantity', 'transactionTypeCategory', 'paymentDate'];
  const rawText = (raw) => (raw ? RAW_KEYS.filter((k) => raw[k] != null).map((k) => `${k}: ${raw[k]}`).join(' · ') : '');
  const detailBox = (x) => {
    const d = x.detail;
    if (!d) return html`<div class="muted small">Ayrıntı yok.</div>`;
    const e = d.expect, keys = (d.records.find((r) => r.raw && r.raw.keys) || {}).raw;
    return html`<div class="row wrap" style="gap:16px;align-items:flex-start">
      <div style="flex:1 1 320px;min-width:0"><div class="small" style="font-weight:650;margin-bottom:4px">Pazaryeri kayıtları · toplam ${money(x.actual)}</div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Tür</th><th class="r">Tutar</th><th class="r">Komisyon</th><th>Tarih / vade</th></tr></thead><tbody>
        ${d.records.map((r) => html`<tr style="${r.counted ? '' : 'opacity:.6'}"><td class="small"><b>${r.type}</b> <span class="muted tiny">${r.rawType}</span>${r.counted ? '' : html` <span class="pill tiny" style="padding:1px 6px">hesaba girmez</span>`}</td>
          <td class="r num" style="color:${r.amount < 0 ? 'var(--bad)' : 'inherit'}">${money(r.amount)}</td><td class="r num">${r.commission ? money(r.commission) : '—'}</td>
          <td class="tiny" style="white-space:nowrap">${r.date ? date(r.date) : '—'}<br><span class="muted">vade ${r.due ? date(r.due) : '—'} · ${r.paid ? 'ödendi' : 'ödenecek'}</span></td></tr>
          ${rawText(r.raw) ? html`<tr style="${r.counted ? '' : 'opacity:.6'}"><td colspan="4" class="tiny muted" style="white-space:normal;overflow-wrap:anywhere;font-family:ui-monospace,Menlo,Consolas,monospace;padding-top:0">${rawText(r.raw)}</td></tr>` : ''}`)}
        ${!d.records.length ? html`<tr><td colspan="4" class="empty">Kayıt yok</td></tr>` : ''}
        </tbody></table></div>
        ${keys && keys.keys ? html`<div class="tiny muted" style="margin-top:4px;white-space:normal;overflow-wrap:anywhere">Kayıttaki alanlar: ${String(keys.keys).split(',').join(', ')}</div>` : ''}</div>
      <div style="flex:1 1 280px;min-width:0"><div class="small" style="font-weight:650;margin-bottom:4px">Panelin beklediği · ${money(e.payout)}</div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Ürün</th><th class="r">Tutar</th><th class="r">Komisyon</th></tr></thead><tbody>
        ${d.lines.map((l) => html`<tr style="${l.counted ? '' : 'opacity:.6'}"><td class="small" style="white-space:normal">${l.name} <span class="muted tiny">× ${n(l.qty)}${l.returned ? ` · ${n(l.returned)} iade` : ''}${l.status && !(l.status === 'returned' && l.returned) ? ` · ${l.status === 'cancelled' ? 'iptal' : l.status === 'returned' ? 'iade' : l.status}` : ''}</span>${l.counted ? '' : html` <span class="pill tiny" style="padding:1px 6px">sayılmadı</span>`}</td>
          <td class="r num">${money(l.total)}</td><td class="r num">${l.commission == null ? html`<span class="muted tiny">tahmin</span>` : money(l.commission)}</td></tr>`)}
        </tbody></table></div>
        <div class="small" style="margin-top:6px;line-height:1.7">${e.dead ? html`<div>Sipariş iptal / tamamı iade: beklenen hakediş <b>0</b></div>` : html`
          <div>Satış <b class="num">${money(e.revenue)}</b></div>
          <div>− Komisyon (KDV dahil${e.commissionSrc === 'estimate' ? ', tahmin' : e.commissionSrc === 'marketplace' ? ', pazaryerinin kestiği' : ''}) <b class="num">${money(e.commission)}</b></div>
          ${e.commissionSrc === 'marketplace' ? html`<div class="muted tiny">Bu siparişte kanal ürün komisyonunu bildirmedi; komisyon ürüne / kategoriye / kampanyaya göre değiştiği için pazaryerinin kestiği tutar esas alındı${e.estCommission != null ? ` (panelin ortalama orandan tahmini ${money(e.estCommission)})` : ''}. Fark yalnız satış, iade ve iptal tutarında aranır.</div>` : ''}
          ${e.credit ? html`<div>+ Komisyon iadesi / indirimi <b class="num">${money(e.credit)}</b></div>` : ''}
          <div>= Beklenen hakediş <b class="num">${money(e.payout)}</b></div>`}
          <div class="muted tiny">Kargo, stopaj, hizmet bedeli ve reklam ayrı kesilir; ikisinde de hesaba girmez.</div></div></div>
    </div>`;
  };
  // Farkın takibi (itiraz edildi / çözüldü / kabul edildi) ve pazaryerine iletilecek itiraz metni
  const DISP_PILL = { disputed: 'warn', resolved: 'good', accepted: 'info' };
  const dispLine = (x) => (x.dispute ? html`<div class="tiny" style="margin-top:3px;white-space:normal;max-width:380px"><span class="pill tiny ${DISP_PILL[x.dispute.status] || ''}" style="padding:2px 8px">${x.dispute.label}</span>
    ${x.dispute.changed ? html`<b style="color:var(--bad)">fark değişti</b> · ` : ''}<span class="muted">${x.dispute.note || ''}${x.dispute.at ? ` · ${date(x.dispute.at)}` : ''}${x.dispute.by ? ` · ${x.dispute.by}` : ''}</span></div>` : '');
  const stlRow = (id) => (stl ? [...stl.diffs, ...(stl.closed || []), ...(stl.pending || []), ...((stl.search || {}).found || [])].find((x) => x.id === id) : null);
  const pctOf = (a, b) => (b ? `%${(Math.round((a / b) * 1000) / 10).toLocaleString('tr-TR')}` : '—');
  const disputeText = (x) => {
    const e = (x.detail || {}).expect || {}, recs = (x.detail || {}).records || [];
    return [`Sipariş no: ${x.order_number} (${ch(x.channel).name})`, `Sipariş tarihi: ${date(x.ordered_at)}`,
      `Beklenen hakediş (satış − komisyon, KDV dahil): ${money(x.expected)}`, `Pazaryerinin ödediği / ödeyeceği: ${money(x.actual)}`, `Fark: ${x.diff > 0 ? '+' : ''}${money(x.diff)}`,
      `Satış: kayıtlarda ${money(x.sales)}, siparişte ${money(e.revenue ?? x.estRevenue)}`,
      `Komisyon: kesilen ${money(x.commission)} (${pctOf(x.commission, x.sales)}), beklenen ${money(e.commission ?? x.estCommission)} (${pctOf(e.commission ?? x.estCommission, e.revenue ?? x.estRevenue)})`,
      `Tespit: ${x.reason}`,
      ...(recs.length ? ['Kayıtlar:', ...recs.map((r) => `- ${r.type}${r.rawType ? ` (${r.rawType})` : ''} ${money(r.amount)} · kayıt ${r.id}${r.raw && r.raw.invoiceNumber ? ` · fatura ${r.raw.invoiceNumber}` : ''} · vade ${r.due ? date(r.due) : '—'}`)] : []),
      'Farkın kontrol edilip düzeltilmesini rica ederiz.'].join('\n');
  };
  function disputeForm(x) {
    const d = x.dispute || {}, txt = disputeText(x);
    const s = sheet({
      title: `#${x.order_number} · fark takibi`, size: 'narrow',
      body: html`<div class="stack">
        <div class="small">Fark <b class="num" style="color:${x.diff < 0 ? 'var(--bad)' : 'var(--good)'}">${x.diff > 0 ? '+' : ''}${money(x.diff)}</b> · ${x.reason}</div>
        <label class="field"><span>Durum</span><select class="input" data-d="status">
          <option value="">Takip yok (açık fark)</option>
          ${Object.entries(stl.disputes || {}).map(([k, l]) => html`<option value="${k}" ${d.status === k ? 'selected' : ''}>${l}</option>`)}</select></label>
        <div class="muted tiny">İtiraz edildi: fark listede kalır, işaretli görünür; pazaryeri düzeltince kendiliğinden “Çözüldü” olur. Çözüldü / Kabul edildi: fark kapatılır, sayıya girmez; tutar değişirse yeniden açılır.</div>
        <label class="field"><span>Not (talep no, görüşme …)</span><input class="input" data-d="note" maxlength="500" value="${d.note || ''}" placeholder="ör. Destek talebi 12345"></label>
        <label class="field"><span>Pazaryerine iletilecek metin</span><textarea class="input" data-d="txt" rows="9" readonly style="font-size:12px">${txt}</textarea></label>
      </div>`,
      foot: html`<button class="btn ghost" data-copy><i class="ico ico-copy"></i>Metni kopyala</button><span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>Kaydet</button>`,
    });
    $('[data-copy]', s.el).onclick = () => navigator.clipboard.writeText(txt).then(() => toast('İtiraz metni kopyalandı'), () => toast('Kopyalanamadı', true));
    $('[data-save]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
      await api('settlements/dispute', { method: 'POST', body: { channel: x.channel, order_number: x.order_number, status: $('[data-d=status]', s.el).value, note: $('[data-d=note]', s.el).value, diff: x.diff } });
      s.close(); toast('Takip kaydedildi'); await loadStl();
    });
  }
  const diffTable = (rows) => html`<div class="table-wrap"><table class="t stl-t"><thead><tr><th>Sipariş</th><th class="r m-hide">Panel hesabı</th><th class="r m-hide">Pazaryeri</th><th class="r">Fark</th></tr></thead><tbody>
    ${rows.map((x) => html`<tr><td><div>${chLogo(x.channel, true)} <a class="link" href="#/siparisler/${encodeURIComponent(x.id)}"><b>#${x.order_number}</b></a> <span class="muted tiny">${date(x.ordered_at)}</span></div>
        <div class="tiny muted" style="white-space:normal;max-width:380px">${x.code === 'ok' ? html`<span class="pill tiny good" style="padding:2px 8px">Uyumlu</span>` : sidePill(/^wait_/.test(x.code) ? 'wait' : x.side)} ${x.reason}</div>${dispLine(x)}<div class="tiny muted m-only">Panel ${money(x.expected)} · Pazaryeri ${money(x.actual)}</div>
        <div class="row" style="gap:4px;margin-top:4px"><button class="btn sm ghost" data-act="stlx" data-id="${x.id}">${stlOpen.has(x.id) ? 'Ayrıntıyı gizle' : 'Ayrıntı'}</button>
        ${x.code !== 'ok' && !/^wait_/.test(x.code) && !viewOnly(state.user, 'finance') ? html`<button class="btn sm ghost" data-act="stldisp" data-id="${x.id}">${x.dispute ? 'Takibi düzenle' : 'İtiraz / takip'}</button>` : ''}</div></td>
      <td class="r num m-hide">${money(x.expected)}</td><td class="r num m-hide">${money(x.actual)}</td>
      <td class="r num" style="font-weight:700;color:${/^wait_/.test(x.code) || x.code === 'ok' ? 'var(--text-2)' : x.diff < 0 ? 'var(--bad)' : 'var(--good)'}">${x.diff > 0 ? '+' : ''}${money(x.diff)}</td></tr>
      ${stlOpen.has(x.id) ? html`<tr><td colspan="4" style="background:var(--surface-2, transparent);white-space:normal;max-width:0">${detailBox(x)}</td></tr>` : ''}`)}
    </tbody></table></div>`;
  const stlOpen = new Set();
  function drawSettlements() {
    const box = $('[data-stl]', el);
    const head = (sub = '') => html`<div class="card-pad card-head" style="flex-wrap:wrap;gap:8px"><div style="flex:1;min-width:200px"><h2>Hakediş</h2><div class="muted small">${sub || 'Pazaryerinin size ödediği ve ödeyeceği tutarlar'}</div></div>
      ${stl && !stl.locked && !stl.error && stl.totals && stl.totals.checked ? html`<a class="btn sm ghost" href="${'/api/settlements.csv?' + stlParams()}" title="Açık ve kapatılan farklar, bekleyenler; takip durumu ve notlarla"><i class="ico ico-download"></i>Farkları Excel'e aktar</a>` : ''}
      ${isAdmin() && stl && !stl.locked ? html`<button class="btn sm" data-act="stlsync"><i class="ico ico-sync"></i>Yenile</button>` : ''}</div>`;
    if (!stl) return render(box, html`${head()}<div class="empty"><i class="ico ico-sync spin"></i></div>`);
    if (stl.locked) return render(box, html`${head()}<div class="notice small" style="margin:12px"><i class="ico ico-key"></i><div><b>Hakediş takibi Profesyonel ve Kurumsal pakette.</b> Pazaryerinin ödemeleri ve kestiği faturalar burada görünür. <a class="link" href="#/paketim">Paketim</a>'den yükseltebilirsiniz.</div></div>`);
    if (stl.error) return render(box, html`${head()}<div class="notice small bad" style="margin:12px"><i class="ico ico-warn"></i><div><b>Hakediş bilgisi açılamadı.</b> ${stl.error} <button class="btn sm" data-act="stlretry">Tekrar dene</button></div></div>`);
    const t = stl.totals, today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10), late = new Date((stl.lateBefore || 0) + 3 * 3600e3).toISOString().slice(0, 10);
    if (!stl.supported.length && !stl.days.length) return render(box, html`${head()}<div class="empty">Hakediş bilgisi Trendyol ve Hepsiburada'dan gelir. Bu kanalları bağlayınca burada görünür.</div>`);
    if (f.channel && !stl.supported.includes(f.channel) && !stl.days.length) return render(box, html`${head()}<div class="empty">${ch(f.channel).name} hakediş bilgisi vermiyor. Hakediş Trendyol ve Hepsiburada'dan gelir.</div>`);
    if (!stl.days.length && !stl.types.length && !t.upcoming) return render(box, html`${head()}<div class="empty">Henüz hakediş kaydı yok.${isAdmin() ? ' “Yenile” ile pazaryerinden alın.' : ' Kayıtlar 6 saatte bir alınır.'}</div>`);
    // Yaklaşan (ödenmemiş: en yakın gün üstte, gecikenler en üstte) ve dönemde ödenen günler (en yeni üstte)
    const last = new Date(Math.min(stl.to, Date.now()) - 1 + 3 * 3600e3).toISOString().slice(0, 10);
    const upc = stl.days.filter((x) => x.due).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)), paid = stl.days.filter((x) => x.paid && x.d <= last).sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0)); // aynı günün ödenen ve ödenmeyen kısmı ayrı listelerde (kart toplamlarıyla aynı)
    const tag = (x) => x.d > today ? html`<span class="pill info tiny">bekleniyor</span>` : x.d === today ? html`<span class="pill info tiny">bugün</span>`
      : x.d < late ? html`<span class="pill bad tiny">gecikti</span>` : html`<span class="pill tiny">işleniyor</span>`;
    const dayTable = (rows, k, more, empty, withTag) => html`<div class="table-wrap"><table class="t stl-t"><thead><tr><th>Ödeme günü</th><th>Kanal</th><th class="r">Tutar</th><th class="r m-hide">Kayıt</th></tr></thead><tbody>
        ${rows.slice(0, f[more] ? 200 : 8).map((x) => html`<tr><td class="small" style="white-space:nowrap">${dmy(x.d)} ${withTag ? tag(x) : ''}</td><td>${chLogo(x.channel, true)}</td>
          <td class="r num" style="font-weight:650;color:${x[k] < 0 ? 'var(--bad)' : 'inherit'}">${money(x[k])}</td><td class="r num muted m-hide">${n((k === 'due' ? x.nd : x.np) ?? x.n)}</td></tr>`)}
        ${!rows.length ? html`<tr><td colspan="4" class="empty">${empty}</td></tr>` : ''}
      </tbody></table></div>${rows.length > 8 && !f[more] ? html`<div class="pager"><button class="btn sm" data-act="stlmore" data-k="${more}">Tümünü göster (${n(rows.length)})</button></div>` : ''}`;
    render(box, html`${head()}
      <div class="kpis" style="padding:0 16px 12px">
        <div class="kpi"><div class="label">Ödenecek</div><div class="value num">${money0(t.upcoming - t.overdue)}</div><div class="delta flat">henüz ödenmedi</div></div>
        <div class="kpi"><div class="label">Geciken</div><div class="value num" style="color:${t.overdue ? 'var(--bad)' : 'inherit'}">${money0(t.overdue)}</div><div class="delta flat">ödeme günü 3 günden fazla geçti</div></div>
        <div class="kpi"><div class="label">Bu dönemde ödenen</div><div class="value num">${money0(t.paid)}</div><div class="delta flat">ödeme gününe göre</div></div>
        <div class="kpi"><div class="label">Mutabakat</div><div class="value num" style="color:${t.mismatched ? 'var(--warn, #b45309)' : 'var(--good)'}">${!t.checked ? '—' : t.mismatched ? `${n(t.mismatched)} fark` : 'Uyumlu'}</div><div class="delta flat">${n(t.checked)} sipariş kontrol edildi${t.pending ? ` · ${n(t.pending)} bekleniyor` : ''}${t.disputed ? ` · ${n(t.disputed)} itirazda` : ''}${t.closed ? ` · ${n(t.closed)} kapatıldı` : ''}</div></div>
      </div>
      ${t.commissionCredit && t.commissionCredit.orders ? html`<div class="notice small" style="margin:0 16px 12px"><i class="ico ico-check"></i><div><b>Komisyon iadesi / indirimi (pazaryeri karşıladı):</b> ${n(t.commissionCredit.orders)} siparişte ${money(t.commissionCredit.amount)}. Panel hesabına eklendi; fark sayılmadı.</div></div>` : ''}
      ${t.campaign && t.campaign.orders ? html`<div class="notice small" style="margin:0 16px 12px"><i class="ico ico-check"></i><div><b>Pazaryerinin karşıladığı kampanya indirimi:</b> ${n(t.campaign.orders)} siparişte ${money(t.campaign.amount)} ayrıca ödendi. Müşterinin ödediği tutara eklenen bu gelir fark sayılmadı.</div></div>` : ''}
      ${t.short ? html`<div class="notice small bad" style="margin:0 16px 12px"><i class="ico ico-warn"></i><div><b>${n(t.short)} siparişte eksik ödeme görünüyor (${money(t.shortAmount)}).</b> Tüm kayıtlar geldiği halde pazaryerinin ödediği tutar düşük. “Farklı çıkan siparişler”den ayrıntıya bakın; “İtiraz / takip” ile pazaryerine iletilecek metni kopyalayıp itirazınızı takip edebilirsiniz.</div></div>` : ''}
      ${(stl.fixed || []).length ? html`<div class="notice small" style="margin:0 16px 12px"><i class="ico ico-check"></i><div><b>${n(stl.fixed.length)} itiraz sonuçlandı:</b> pazaryeri farkı düzeltti (${stl.fixed.slice(0, 6).map((x) => '#' + x.order_number).join(', ')}${stl.fixed.length > 6 ? ' …' : ''}). Sonraki senkronda takip “Çözüldü” olur.</div></div>` : ''}
      <div style="padding:0 16px 12px"><form class="row" style="gap:6px;max-width:420px" data-stlsearch><input class="input" name="q" placeholder="Sipariş no ile mutabakat ara" value="${f.stlq || ''}" style="flex:1" inputmode="search">
        <button class="btn sm">Ara</button>${f.stlq ? html`<button class="btn sm ghost" type="button" data-act="stlclear">Temizle</button>` : ''}</form></div>
      ${stl.search ? html`<div style="padding:0 16px 8px"><div class="small" style="font-weight:650;margin-bottom:6px">“${stl.search.q}” araması · ${n(stl.search.found.length)} sipariş</div>
        ${stl.search.found.length ? diffTable(stl.search.found) : html`<div class="muted small">Seçilen dönemde bu numarayla hakediş kaydı olan panel siparişi yok.${stl.search.unmatched.length ? '' : ' Dönemi genişletmeyi deneyin.'}</div>`}
        ${stl.search.unmatched.length ? html`<div class="muted tiny" style="margin-top:6px">Panelde olmayan siparişlerin kayıtları: ${stl.search.unmatched.map((x) => `#${x.order_number} (${money(x.amount)})`).join(', ')}</div>` : ''}</div>` : ''}
      <div class="card-pad" style="padding-top:0;padding-bottom:6px"><b class="small">Yaklaşan ödemeler</b></div>
      ${dayTable(upc, 'due', 'stlup', 'Bekleyen ödeme yok', true)}
      <div class="card-pad" style="padding-bottom:6px"><b class="small">Bu dönemde ödenenler</b></div>
      ${dayTable(paid, 'paid', 'stlpaid', 'Bu dönemde ödeme yok', false)}
      ${stl.types.length ? html`<div style="padding:12px 16px 4px"><div class="small" style="font-weight:650;margin-bottom:6px">Dönemin kayıtları <span class="muted">· toplam ${money0(t.period)}</span></div><div class="row wrap" style="gap:8px">${stl.types.map((x) => html`<span class="chip" title="${x.raw ? 'Kanalın gönderdiği tür: ' + x.raw : `${n(x.n)} kayıt`}">${x.type} <b class="num" style="margin-left:4px;color:${x.amount < 0 ? 'var(--bad)' : 'inherit'}">${money0(x.amount)}</b></span>`)}</div></div>` : ''}
      ${(stl.summary || []).length ? html`<div style="padding:8px 16px 4px"><div class="small" style="font-weight:650;margin-bottom:6px">Fark özeti (kanal ve nedene göre)</div>
        <div class="table-wrap"><table class="t stl-t"><thead><tr><th>Kanal</th><th>Neden</th><th class="r">Sipariş</th><th class="r">Fark</th></tr></thead><tbody>
        ${stl.summary.map((x) => html`<tr><td>${chLogo(x.channel, true)}</td><td class="small" style="white-space:normal">${sidePill(x.pending ? 'wait' : x.side)} ${x.label}</td><td class="r num">${n(x.n)}</td>
          <td class="r num" style="font-weight:650;color:${x.pending ? 'inherit' : x.diff < 0 ? 'var(--bad)' : 'var(--good)'}">${x.diff > 0 ? '+' : ''}${money(x.diff)}</td></tr>`)}
        </tbody></table></div>
        <div class="muted tiny" style="margin:6px 0">${sidePill('panel')} ${(stl.sides || {}).panel || ''} · ${sidePill('short')} ${(stl.sides || {}).short || ''} · ${sidePill('extra')} ${(stl.sides || {}).extra || ''} · ${sidePill('wait')} Fark sayılmaz, kayıt gelince eşleşir.</div></div>` : ''}
      ${(stl.noOrder || []).length ? html`<div class="notice small" style="margin:6px 16px"><i class="ico ico-warn"></i><div><b>Sipariş numarası olmayan kayıtlar:</b> ${stl.noOrder.map((x) => `${ch(x.channel).name} ${x.type} ${n(x.n)} kayıt (${money(x.amount)})`).join(' · ')}. Bu kayıtlar hiçbir siparişle eşleşemez; mutabakatta görünmez.</div></div>` : ''}
      ${stl.diffs.length ? html`<details style="padding:8px 16px 4px" ${f.stlOpenD ? 'open' : ''}><summary style="cursor:pointer;font-weight:650" data-act="stlopen" data-k="stlOpenD">Farklı çıkan siparişler (${n(t.mismatched)})</summary>
        <div class="muted tiny" style="margin:6px 0">Pazaryerinin ödediği tutar, panelin hesabından farklı. Fark nedeni ve tarafı her satırda yazıyor; “Ayrıntı” ile pazaryerinin kayıtlarını ve panelin beklediğini yan yana görebilirsiniz.${t.mismatched > stl.diffs.length ? ` Farkı en büyük ${n(stl.diffs.length)} sipariş listeleniyor.` : ''}</div>
        ${diffTable(stl.diffs)}</details>` : ''}
      ${(stl.closed || []).length ? html`<details style="padding:8px 16px 4px" ${f.stlOpenC ? 'open' : ''}><summary style="cursor:pointer;font-weight:650" data-act="stlopen" data-k="stlOpenC">Kapatılan farklar (${n(t.closed)})</summary>
        <div class="muted tiny" style="margin:6px 0">“Çözüldü” ya da “Kabul edildi” olarak işaretlediğiniz farklar. Mutabakat sayısına girmez; farkın tutarı değişirse yeniden açılır.</div>
        ${diffTable(stl.closed)}</details>` : ''}
      ${(stl.pending || []).length ? html`<details style="padding:8px 16px 4px" ${f.stlOpenP ? 'open' : ''}><summary style="cursor:pointer;font-weight:650" data-act="stlopen" data-k="stlOpenP">Kaydı tamamlanmayı bekleyenler (${n(t.pending)})</summary>
        <div class="muted tiny" style="margin:6px 0">Pazaryeri bu siparişlerin satış kaydını gönderdi, komisyon kaydını henüz göndermedi (ya da tersi). Hepsiburada satışı ve komisyonu ayrı kayıtlarla işler; komisyon sonradan gelir. Fark sayılmaz; kayıt gelince otomatik eşleşir. Sipariş ${Math.round(((stl.pending[0] || {}).waitUntil - (stl.pending[0] || {}).ordered_at) / D) || 45} gün içinde tamamlanmazsa ya da ödeme yapıldığı halde kayıt gelmezse farka döner.${t.pending > stl.pending.length ? ` En yeni ${n(stl.pending.length)} sipariş listeleniyor.` : ''}</div>
        ${diffTable(stl.pending)}</details>` : ''}
      ${t.unmatched ? html`<details style="padding:8px 16px 4px"><summary style="cursor:pointer;font-weight:650">Panelde olmayan siparişler (${n(t.unmatched)}${t.unmatched >= 1000 ? '+' : ''}) · ${money0(t.unmatchedAmount)}</summary>
        <div class="muted tiny" style="margin:6px 0">Pazaryeri bu siparişler için ödeme kaydı gönderdi ama sipariş panelde yok (genelde panel kurulmadan önceki siparişler). Entegrasyonlar → Geçmiş siparişler ile aktarabilirsiniz.</div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Sipariş</th><th>Tarih</th><th class="r">Tutar</th></tr></thead><tbody>
        ${stl.unmatched.map((x) => html`<tr><td>${chLogo(x.channel, true)} <b>#${x.order_number}</b></td><td class="small">${x.date ? date(x.date) : '—'}</td><td class="r num">${money(x.amount)}</td></tr>`)}
        </tbody></table></div></details>` : ''}
      <div class="muted tiny" style="padding:8px 16px 14px">Mutabakat: pazaryerinin ödediği tutar, panelin “satış − komisyon” hesabıyla karşılaştırılır. Kargo, stopaj ve hizmet bedeli ayrı kesildiği için hesaba girmez. Trendyol'un karşıladığı indirim ve kuponlar ay sonunda ayrıca ödenir. Hepsiburada'da satış ve komisyon ayrı kayıttır: komisyon kaydı gelene kadar sipariş “bekleniyor” listesinde durur. ${t.limited ? 'Dönemin en yeni 3.000 siparişi kontrol edildi.' : ''}</div>`);
  }
  const stlParams = () => { const [from, to] = span(); return new URLSearchParams({ from, to, ...(f.channel ? { channel: f.channel } : {}) }); };
  async function loadStl() {
    if (locked('finance')) return;
    const p = stlParams(); if (f.stlq) p.set('q', f.stlq);
    stl = await api('settlements?' + p).catch((e) => ({ error: e.message }));
    drawSettlements();
  }
  el.addEventListener('submit', (e) => {
    const fm = e.target.closest('[data-stlsearch]'); if (!fm) return;
    e.preventDefault(); f.stlq = fm.q.value.trim(); loadStl();
  });
  async function load() {
    store.set('finance', { range: f.range, from: f.from, to: f.to });
    setQuery({ channel: f.channel });
    const [from, to] = span();
    const p = new URLSearchParams({ from, to });
    if (f.channel) p.set('channel', f.channel);
    inv = null; prod = null; comm = null;
    [d, exp] = await Promise.all([api('finance?' + p), api('expenses').catch(() => ({ items: [], categories: [] }))]);
    draw(); drawProducts(); drawExpenses(); drawCommission();
    api('finance/commission?' + p).then((r) => { comm = r; drawCommission(); }).catch((e) => { comm = { error: e.message }; drawCommission(); });
    api('finance/products?' + new URLSearchParams([...p, ['sort', f.psort]])).then((r) => { prod = r; drawProducts(); if (jump) { jump = null; $('[data-prod]', el).scrollIntoView({ block: 'start', behavior: 'smooth' }); } }).catch(() => { prod = { rows: [], total: 0 }; drawProducts(); });
    if (f.itype) p.set('type', f.itype);
    stl = null; drawSettlements();
    [inv, stl] = locked('finance') ? [{ locked: true }, { locked: true }] : await Promise.all([
      api('invoices?' + p).catch((e) => ({ items: [], types: [], supported: [], total: 0, sum: 0, error: e.message })),
      api('settlements?' + new URLSearchParams([...p].filter(([k]) => k !== 'type').concat(f.stlq ? [['q', f.stlq]] : []))).catch((e) => ({ error: e.message })),
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
    stlmore: (t) => { f[t.dataset.k] = true; drawSettlements(); },
    stlx: (t) => { const id = t.dataset.id; if (stlOpen.has(id)) stlOpen.delete(id); else stlOpen.add(id); drawSettlements(); },
    // <details> açık / kapalı durumu yeniden çizimde korunur (ayrıntı açınca liste kapanmasın)
    stlopen: (t) => { const d = t.closest('details'); f[t.dataset.k] = !(d && d.open); if (d) d.open = f[t.dataset.k]; },
    stlretry: (t) => busy(t, loadStl),
    stldisp: (t) => { const x = stlRow(t.dataset.id); if (x) disputeForm(x); },
    stlclear: () => { f.stlq = ''; loadStl(); },
    expadd: () => expenseForm(),
    expedit: (t) => expenseForm(exp.items.find((x) => x.id === Number(t.closest('tr').dataset.id))),
    expdel: async (t) => { const x = exp.items.find((y) => y.id === Number(t.closest('tr').dataset.id)); if (x && (await confirmBox(`"${x.title}" gideri silinsin mi?`, 'Sil'))) { await api(`expenses/${x.id}`, { method: 'DELETE' }); await load(); } },
    stlsync: (t) => busy(t, async () => { const r = await api('settlements/sync', { method: 'POST' }); toast(Object.entries(r).map(([k, v]) => `${ch(k).name}: ${typeof v === 'string' ? v : `${v} kayıt`}`).join(' · ') || 'Hakediş bilgisi veren kanal yok'); await load(); }),
    invsync: (t) => busy(t, async () => { const r = await api('invoices/sync', { method: 'POST' }); toast(Object.entries(r.invoices || r).map(([k, v]) => `${ch(k).name}: ${typeof v === 'string' ? v : `${v} fatura`}${r.costs && typeof r.costs[k] === 'number' ? `, ${r.costs[k]} siparişe kargo` : ''}`).join(' · ') || 'Fatura bilgisi veren kanal yok'); await load(); }),
  });
  bindCustom(el, f, refresh);
  await refresh();
  return { refresh };
}
