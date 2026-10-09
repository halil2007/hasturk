// Genel Bakış: dönem seçimi, kanal bağlantıları, KPI'lar (eğilim çizgili), satış performansı (önceki dönemle),
// kanal dağılımı, son siparişler + seçili siparişin işlemleri, en çok satanlar, ortak stok, hızlı kâr hesabı.
import { api, state, html, raw, render, $, $$, money, money0, compact, n, pct, delta, ago, ch, chLogo, chBadge, chColor, chState, statusPill, thumb, actions, toast, dayKey, store, numIn, rangeLabel, activeChannels, sheet, busy } from '../core.js';
import { lineChart, sparkline } from '../chart.js';
import { profit } from '../profit.js';
import { mountOps } from './orderops.js';
import { loadSummary } from '../app.js';
import { stockDialog } from './products.js';

const D = 864e5;
function presetRange(k) {
  const t = dayKey();
  if (k === 'today') return [t, t];
  if (k === '7') return [dayKey(Date.now() - 6 * D), t];
  if (k === '30') return [dayKey(Date.now() - 29 * D), t];
  return [t.slice(0, 8) + '01', t];
}
const label = (k, g) => (g === 'month' ? new Date(k + '-15T12:00:00Z').toLocaleDateString('tr-TR', { month: 'short' }) : `${Number(k.slice(8, 10))} ${new Date(k + 'T12:00:00Z').toLocaleDateString('tr-TR', { month: 'short' })}`);
const title = (k, g) => (g === 'month' ? new Date(k + '-15T12:00:00Z').toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) : g === 'week' ? `${label(k, 'day')} haftası` : new Date(k + 'T12:00:00Z').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' }));

export async function dashboard(el) {
  const f = store.get('dash', { preset: '30', metric: 'revenue', compare: true });
  if (f.preset !== 'custom') [f.from, f.to] = presetRange(f.preset);
  let chart = null, d = null, ord = { status: 'all', rows: [] }, selected = null;
  const calc = store.get('dash-calc', { sale: '1250', purchase: '650', rate: '15', ship: '110' });

  async function load() {
    store.set('dash', f);
    const [dash, s, o] = await Promise.all([
      api(`dashboard?from=${f.from}&to=${f.to}`), loadSummary(false), api(`orders?status=${ord.status}&limit=6`),
    ]);
    d = dash; ord.rows = o.orders; ord.counts = o.counts;
    if (!selected || !ord.rows.some((x) => x.id === selected)) selected = (ord.rows.find((x) => x.status === 'processing' || x.status === 'new') || ord.rows[0] || {}).id || null;
    draw(s);
  }

  function kpi(lab, cur, prev, fmt, spark, opts = {}) {
    const dl = delta(cur, prev), cls = dl == null || dl === 0 ? 'flat' : dl > 0 ? 'up' : 'down';
    return html`<div class="kpi"><div class="label">${lab}</div><div class="value num">${fmt(cur)}</div>
      <div class="delta ${cls}">${dl == null ? '' : dl > 0 ? '▲' : dl < 0 ? '▼' : ''} ${pct(dl)} <span class="muted" style="font-weight:500">önceki ${fmt(prev)}</span></div>
      ${opts.warn ? html`<a class="kpi-warn" href="#/urunler?f=nocost" title="Alış fiyatı girilmemiş ürünlerde kâr maliyetsiz hesaplanır; gerçek kâr daha düşüktür">⚠ ${opts.warn} satırda alış fiyatı yok · kâr olduğundan yüksek görünür</a>` : raw(sparkline(spark, opts.color))}</div>`;
  }

  function draw(s) {
    const c = d.current, p = d.previous;
    const toShip = d.pending.new + d.pending.processing;
    const totalRev = c.total.revenue || 1;
    const chs = activeChannels().filter((x) => x.enabled || x.demo).length ? activeChannels().filter((x) => x.enabled || x.demo) : activeChannels();
    const sm = state.summary || {}, newN = (sm.pending || []).filter((x) => x.status === 'new').reduce((a, x) => a + x.n, 0);
    const hour = new Date().getHours(), u = state.user || {};
    const tasks = [
      ['blue', 'orders', newN, 'Yeni sipariş', '#/siparisler?status=new'],
      ['red', 'warn', sm.late || 0, 'Gecikme riski olan sipariş', '#/siparisler?status=new'],
      ['orange', 'truck', sm.cargoWaiting || 0, 'Kargoya hazırlanacak', '#/kargo'],
      ['purple', 'link', sm.unmatched || 0, 'Eşleşme bekleyen ilan', '#/eslestirme'],
      ['red', 'db', sm.stockOut || 0, 'Stokta olmayan ürün', '#/stoklar?durum=out'],
      // Açık sorunlar yalnız bizim yönetim panelimizde; müşteri panellerinde ve demoda gösterilmez
      ...(!state.tenant && !state.demo ? [['green', 'bell', (sm.notices && sm.notices.open) || 0, 'Açık sorun', '#/bildirimler']] : []),
    ];
    // Kurulum rehberi: kanal bağlanmadıysa boş grafikler yerine adım adım ilk kurulum; ürün yoksa panonun üstünde
    const live = activeChannels().some((x) => x.enabled || x.demo), st = state.settings || {}, co = st.company || {}, admin = u.role === 'admin';
    // Web sitesindeki demo paneli (firma kodu "demo"): kurulum rehberi yerine deneme hesabı çağrısı
    const demoPanel = !!(state.tenant && state.tenant.slug === 'demo');
    const steps = [
      [live, 'Satış kanalınızı bağlayın', 'Sitenizi ve pazaryerlerinizi (Trendyol, Hepsiburada, ikas …) API bilgileriyle bağlayın; siparişleriniz kendiliğinden gelir.', '#/entegrasyonlar', 'Kanal bağla'],
      [!!d.stock.products, 'Ürünlerinizi panele alın', 'Kanallardaki ilanlarınızı seçip panele ekleyin; aynı ürün farklı kanallarda barkod / stok koduyla eşleşir.', '#/kanal-urunleri', 'Ürünleri al'],
      [!!(st.stock_sync || Object.values(st.stock_push || {}).some(Boolean) || (st.setup || {}).stock), 'Stok gönderimine karar verin', st.stock_sync ? 'Stoklar tüm kanallara otomatik gidiyor.' : 'Açarsanız bir kanalda satılan ürünün stoğu diğer kanallarda da düşer (fazla satış olmaz). Kapalıyken stoklar yalnız okunur.', '#stock-decide', 'Karar ver'],
      [!!(co.phone || co.address || co.tax), 'Firma bilgilerinizi girin', 'Logo, ünvan ve adres kargo etiketinde ve e-postalarda kullanılır.', '#/ayarlar', 'Ayarlara git'],
      [false, 'Komisyon ve kargo giderlerini kontrol edin', 'Kâr hesapları için kanal komisyon oranlarınızı ve kargo giderinizi girin (isteğe bağlı).', '#/ayarlar', 'Giderler'],
      [false, 'Ekibinizi ekleyin', 'Personel ekleyip her kişiye yalnız ihtiyaç duyduğu bölümleri açın (isteğe bağlı).', '#/kullanicilar', 'Personel'],
    ];
    const done = steps.filter((x) => x[0]).length, need = steps.slice(0, 4).some((x) => !x[0]);
    const guide = html`<div class="card guide"><div class="row wrap" style="gap:10px"><div style="flex:1;min-width:220px"><h2>Kurulum adımları</h2><div class="muted small">${admin ? 'Paneli birkaç adımda kullanıma hazırlayın.' : 'Kurulumu firmanızın yöneticisi tamamlar.'}</div></div>
      <div class="guide-prog"><b>${done}/${steps.length}</b><div class="prog"><span style="width:${(done / steps.length) * 100}%"></span></div></div>${live && admin ? html`<button class="btn sm ghost" data-act="guide-hide" title="Rehberi gizle">Gizle</button>` : ''}</div>
      <ol class="steps">${steps.map(([ok, t, dsc, href, btn], i) => html`<li class="${ok ? 'ok' : ''}"><span class="no">${ok ? html`<i class="ico ico-check"></i>` : i + 1}</span><div style="flex:1;min-width:0"><b>${t}</b><div class="muted small">${dsc}</div></div>${!ok && admin ? (href === '#stock-decide' ? html`<button class="btn sm ${i === steps.findIndex((s2) => !s2[0]) ? 'primary' : ''}" data-act="stock-decide">${btn}</button>` : html`<a class="btn sm ${i === steps.findIndex((s2) => !s2[0]) ? 'primary' : ''}" href="${href}">${btn}</a>`) : ''}</li>`)}</ol></div>`;
    if (!live) {
      render(el, html`<div class="hello"><div><h2>Hoş geldiniz${u.name && u.id ? `, ${u.name.split(' ')[0]}` : ''}</h2><div class="muted small">Siparişleriniz, stoklarınız ve kârınız bu ekranda toplanacak. Başlamak için ilk satış kanalınızı bağlayın.</div></div></div>${guide}`);
      return;
    }
    render(el, html`
      ${demoPanel ? html`<div class="card demo-strip"><div style="flex:1;min-width:220px"><b>Demo paneli</b><div class="muted small">Örnek siparişlerle çalışır; yaptığınız değişiklikler kısa süre sonra kendiliğinden geri alınır. Siparişleri işleme alın, kargo adımlarını ve raporları deneyin. Kendi mağazalarınızla denemek için 7 günlük ücretsiz paneliniz formu doldurduğunuz anda açılır.</div></div><a class="btn primary" href="https://hasturkcrm.com/demo#deneme" target="_blank" rel="noopener">7 gün ücretsiz deneyin</a></div>` : need && !(st.setup || {}).hidden ? guide : ''}
      <div class="hello"><div><h2>${hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar'}${u.name && u.id ? `, ${u.name.split(' ')[0]}` : ''}</h2>
        <div class="muted small">${new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · bugün ${n(Object.values(sm.today || {}).reduce((a, x) => a + x.orders, 0))} sipariş, ${money0(Object.values(sm.today || {}).reduce((a, x) => a + x.revenue, 0))}</div></div></div>
      <div class="tasks">${tasks.map(([c, i, v, t, href]) => html`<a class="task ${c} ${v ? '' : 'zero'}" href="${href}"><span class="ic"><i class="ico ico-${i}"></i></span><div style="min-width:0"><b class="num">${n(v)}</b><span>${t}</span></div></a>`)}</div>
      <div class="date-bar">
        ${[['today', 'Bugün'], ['7', '7 gün'], ['month', 'Bu ay'], ['30', '30 gün']].map(([k, t]) => html`<button class="chip ${f.preset === k ? 'on' : ''}" data-act="preset" data-k="${k}">${t}</button>`)}
        <label class="date-pick" title="${rangeLabel(f.from, f.to)}"><i class="ico ico-cal"></i><input type="date" data-from value="${f.from}" aria-label="Başlangıç"><span class="muted">–</span><input type="date" data-to value="${f.to}" aria-label="Bitiş"></label>
      </div>
      ${!chs.some((x) => x.enabled) ? html`<div class="notice warn" style="margin-bottom:14px"><i class="ico ico-warn"></i><div style="flex:1">Henüz hiçbir satış kanalı bağlı değil. API bilgilerini <b>Entegrasyonlar</b> sayfasından girin.</div><a class="btn sm primary" href="#/entegrasyonlar">Entegrasyonlar</a></div>` : ''}
      ${chs.some((x) => x.enabled) && !d.stock.products ? html`<div class="notice" style="margin-bottom:14px"><div style="flex:1">İlk adım: kanallardaki ürünleri görsel ve varyantlarıyla içe aktarın; barkodu/SKU'su kesin uyuşanlar otomatik eşleşir, diğerleri Eşleştirme sayfasına düşer.</div><a class="btn sm primary" href="#/urunler/ice-aktar">İçe aktar</a></div>` : ''}
      <div class="ch-cards">${chs.map((x) => { const [k, t] = chState(x); return html`<a class="ch-card" href="#/entegrasyonlar">${chLogo(x.id)}
        <div class="meta"><div class="nm"><span class="ellipsis">${x.type === 'ikas' ? x.name : x.name}</span></div>
        <div class="st ${k}"><span class="led ${k === 'off' ? 'off' : k === 'err' ? 'err' : k === 'demo' ? 'demo' : ''}"></span>${t}</div>
        <div class="sub ellipsis">${x.last && x.last.ordersAt ? `Son başarılı: ${ago(x.last.ordersAt)}` : x.enabled ? 'Henüz eşitlenmedi' : 'API bilgisi girilmedi'}</div></div><i class="ico ico-chev muted"></i></a>`; })}</div>

      <div class="kpis" style="margin-top:16px">
        ${kpi('Toplam ciro', c.total.revenue, p.total.revenue, money0, c.revenue)}
        ${kpi('Sipariş adedi', c.total.orders, p.total.orders, (v) => n(v), c.orders, { color: 'var(--good)' })}
        ${kpi(d.missingCost ? 'Tahmini kâr (eksik veri)' : 'Tahmini kâr', c.total.profit, p.total.profit, money0, c.profit, { color: 'var(--good)', warn: d.missingCost })}
        <a class="kpi" href="#/kargo"><div class="label">Bekleyen kargo</div><div class="value num">${toShip}</div>
          <span class="kpi-ico"><i class="ico ico-box"></i></span>
          <span class="kpi-link"><i class="ico ico-tag"></i>Etiket oluştur <i class="ico ico-chev"></i></span></a>
      </div>


      <div class="dash-grid perf">
        <div class="card">
          <div class="card-head"><h2>Satış performansı</h2>
            <div class="seg"><button data-act="metric" data-k="revenue" class="${f.metric === 'revenue' ? 'on' : ''}">Ciro</button><button data-act="metric" data-k="orders" class="${f.metric === 'orders' ? 'on' : ''}">Sipariş</button></div>
            <button class="btn sm ${f.compare ? 'soft' : 'ghost'}" data-act="compare"><i class="ico ico-bars"></i>Dönem karşılaştır</button></div>
          <div data-chart></div>
          <div class="legend" style="justify-content:center;margin-top:8px"><span class="it"><span class="pt"></span>Bu dönem</span>${f.compare ? html`<span class="it"><span class="ln dash"></span>Önceki dönem</span>` : ''}</div>
        </div>
        <div class="card">
          <div class="card-head"><h2>Kanal dağılımı</h2><span class="muted small">ciro payı</span></div>
          <div class="dist">${chs.map((x) => { const v = c.totals[x.id] ? c.totals[x.id].revenue : 0, sh = (v / totalRev) * 100; return html`
            <span class="ellipsis">${x.type === 'ikas' ? `ikas ${x.name}` : x.name}</span><div class="bar" title="${money0(v)}"><span style="width:${c.total.revenue ? sh : 0}%;background:${chColor(x.id)}"></span></div><span class="num muted" style="text-align:right">%${n(c.total.revenue ? sh : 0)}</span>`; })}</div>
          <div class="muted tiny" style="margin-top:14px">${rangeLabel(d.from, d.to)} · toplam ${money0(c.total.revenue)}</div>
        </div>
      </div>

      <div class="dash-grid ord">
        <div class="card flush">
          <div class="card-pad row wrap" style="gap:10px"><h2 style="margin-right:6px">Siparişler</h2>
            ${[['all', 'Tümü'], ['new', 'Yeni'], ['processing', 'Hazırlanıyor'], ['shipped', 'Kargoda']].map(([k, t]) => html`<button class="tab ${ord.status === k ? 'on' : ''}" style="flex:0 0 auto;min-height:34px" data-act="ost" data-k="${k}">${t}</button>`)}
            <span class="spacer"></span><a class="btn sm" href="#/siparisler"><i class="ico ico-filter"></i>Filtrele</a><a class="btn sm outline" href="#/siparisler?status=new"><i class="ico ico-dots"></i>Toplu işlem</a></div>
          <div class="table-wrap"><table class="t"><thead><tr><th>Sipariş</th><th>Ürün</th><th class="r">Tutar</th><th class="r xl-only">Kâr</th><th>Durum</th></tr></thead><tbody>
            ${ord.rows.length ? ord.rows.map((o) => html`<tr class="click ${selected === o.id ? 'sel-row' : ''}" data-act="pick" data-id="${o.id}">
              <td style="white-space:nowrap"><span class="row" style="gap:8px">${chLogo(o.channel, true)}<span style="font-weight:750;color:var(--primary)">#${o.order_number}</span></span></td>
              <td style="max-width:0;width:40%"><div class="row" style="min-width:0">${thumb(o.items[0] && o.items[0].image, o.items[0] && o.items[0].name, 'sm')}<span class="ellipsis" style="min-width:0;flex:0 1 auto">${o.items[0] ? o.items[0].name : ''}</span>${o.lines > 1 ? html`<span class="link small">+${o.lines - 1}</span>` : ''}</div></td>
              <td class="r num">${money0(o.total)}</td><td class="r num xl-only ${o.profit >= 0 ? 'up' : 'down'}" style="font-weight:650">${o.profit == null ? '—' : money0(o.profit)}</td>
              <td>${statusPill(o.status)}</td></tr>`) : html`<tr><td colspan="5" class="empty">Sipariş yok</td></tr>`}
          </tbody></table></div>
        </div>
        <div class="card" data-sel-panel>${selected ? '' : html`<div class="empty">Bir sipariş seçin</div>`}</div>
      </div>

      <div class="dash-grid bottom">
        <div class="card">
          <div class="card-head"><h2>En çok satanlar</h2><a class="link small" href="#/analiz">Tümünü gör ›</a></div>
          ${d.top.length ? html`<div class="best">${d.top.slice(0, 4).map((x) => html`<div class="it">${thumb(x.image, x.name)}<div style="min-width:0"><div class="ellipsis" style="font-weight:650">${x.name}</div><div class="muted small">${x.qty} satış · ${money0(x.revenue)}</div></div></div>`)}</div>` : html`<div class="empty">Bu dönemde satış yok</div>`}
        </div>
        <div class="card">
          <div class="card-head"><h2 style="white-space:nowrap">Ortak stok</h2>
            <span class="row small" style="color:${d.stockSync ? 'var(--good)' : 'var(--amber)'}"><span class="led ${d.stockSync ? '' : 'demo'}"></span>${d.stockSync ? `${chs.filter((x) => x.enabled).length} kanalda güncel` : 'senkron kapalı'}</span>
            <a class="link small" href="#/stoklar?durum=below">Tümü ›</a></div>
          <div class="row small muted" style="margin-bottom:6px">${d.stock.products} ürün · ${n(d.stock.units)} adet${d.stock.waiting ? ` · ${d.stock.waiting} ilan gönderim bekliyor` : ''}</div>
          ${d.lowStock.length ? d.lowStock.slice(0, 4).map((x) => html`<div class="li">${thumb(x.image, x.name, 'sm')}<span class="ellipsis" style="flex:1">${x.name}</span><b class="num">${x.stock} adet</b><button class="pill warn" style="border:0;cursor:pointer" data-act="stock" data-id="${x.id}"><i class="ico ico-warn"></i>Düşük stok</button></div>`)
            : html`<div class="notice good small"><i class="ico ico-check"></i>Kritik stokta ürün yok</div>`}
        </div>
        <div class="card">
          <div class="card-head"><h2>Hızlı kâr hesabı</h2><a class="link small" href="#/kar">Detaylı ›</a></div>
          <div class="row" style="align-items:stretch;gap:12px">
            <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px;flex:1">
              ${[['sale', 'Satış'], ['purchase', 'Alış'], ['rate', 'Kom. %'], ['ship', 'Kargo']].map(([k, t]) => html`<label class="field"><span class="tiny">${t}</span><input class="input" style="min-height:36px" inputmode="decimal" data-calc="${k}" value="${calc[k]}"></label>`)}
            </div>
            <div class="gain" style="flex:0 0 42%;display:grid;align-content:center;padding:12px" data-gain></div>
          </div>
        </div>
      </div>`);
    drawChart();
    drawGain();
    const panel = $('[data-sel-panel]', el);
    if (selected) mountOps(panel, selected, { mode: 'panel', onChange: load });
  }

  function drawChart() {
    if (chart) chart.destroy();
    const fmt = f.metric === 'orders' ? (v) => `${n(v)} sipariş` : money0;
    chart = lineChart($('[data-chart]', el), {
      labels: d.keys.map((k) => label(k, d.group)), titles: d.keys.map((k) => title(k, d.group)),
      current: d.current[f.metric], previous: f.compare ? d.previous[f.metric] : null,
      format: fmt, axisFormat: f.metric === 'orders' ? (v) => n(v) : compact,
    });
  }
  function drawGain() {
    const r = profit({ sale: numIn(calc.sale), purchase: numIn(calc.purchase), commissionRate: numIn(calc.rate), shipping: numIn(calc.ship) });
    const g = $('[data-gain]', el);
    if (!g) return;
    g.style.background = r.unitProfit >= 0 ? 'var(--good-soft)' : 'var(--bad-soft)';
    render(g, html`<div class="tiny" style="font-weight:700;color:var(--text-2)">Kazanç</div><div class="v num" style="font-size:24px;color:${r.unitProfit >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(r.unitProfit)}</div><div class="tiny muted">Kâr marjı %${n(r.margin)}</div>`);
  }

  const setupSave = async (patch, msg) => {
    state.settings = await api('settings', { method: 'PUT', body: { ...patch, setup: { ...((state.settings || {}).setup || {}), ...(patch.setup || {}) } } });
    toast(msg); await loadSummary().catch(() => {}); draw(state.summary);
  };
  actions(el, {
    'guide-hide': () => setupSave({ setup: { hidden: true } }, 'Kurulum rehberi gizlendi (Ayarlar\'dan devam edebilirsiniz)'),
    'stock-decide': () => {
      const unmatched = (state.summary && state.summary.unmatched) || 0;
      const s = sheet({ title: 'Stoklar pazaryerlerine gönderilsin mi?', size: 'narrow', body: html`<div class="stack">
        <p style="margin:0"><b>Açarsanız:</b> paneldeki stok adedi bağlı tüm kanallara otomatik gönderilir. Bir kanalda satılan ürünün stoğu diğerlerinde de düşer; aynı ürünü iki kez satmazsınız.</p>
        <p style="margin:0" class="muted"><b>Kapalı kalırsa:</b> stoklar yalnız okunur; her kanalın stoğunu o kanalın panelinden siz yönetirsiniz.</p>
        ${unmatched ? html`<div class="notice warn small"><i class="ico ico-warn"></i><div>${n(unmatched)} ilan henüz bir ürüne eşleşmedi. Açmadan önce <a class="link" href="#/eslestirme">Eşleştirme</a>'yi tamamlamanız önerilir (eşleşmeyen ilanın stoğu gönderilmez).</div></div>` : ''}
        <div class="muted tiny">Bu ayarı sonra Ayarlar → Stok'tan değiştirebilirsiniz; kanal bazında da Entegrasyonlar'dan açıp kapatabilirsiniz.</div></div>`,
        foot: html`<button class="btn" data-off>Şimdilik kapalı kalsın</button><span class="spacer"></span><button class="btn primary" data-on>Evet, stokları gönder</button>` });
      $('[data-on]', s.el).onclick = (e) => busy(e.currentTarget, async () => { s.close(); await setupSave({ stock_sync: true, setup: { stock: 'on' } }, 'Stok gönderimi açıldı; değişen stoklar kanallara gider'); });
      $('[data-off]', s.el).onclick = (e) => busy(e.currentTarget, async () => { s.close(); await setupSave({ setup: { stock: 'off' } }, 'Stok gönderimi kapalı kaldı'); });
    },
    preset: (t) => { f.preset = t.dataset.k; [f.from, f.to] = presetRange(f.preset); load().catch((e) => toast(e.message, true)); },
    metric: (t) => { f.metric = t.dataset.k; store.set('dash', f); $$('[data-act=metric]', el).forEach((b) => b.classList.toggle('on', b === t)); drawChart(); },
    compare: () => { f.compare = !f.compare; draw(state.summary); },
    ost: async (t) => { ord.status = t.dataset.k; const o = await api(`orders?status=${ord.status}&limit=6`); ord.rows = o.orders; selected = (ord.rows[0] || {}).id || null; draw(state.summary); },
    pick: (t) => { selected = t.dataset.id; $$('[data-act=pick]', el).forEach((r) => r.classList.toggle('sel-row', r === t)); mountOps($('[data-sel-panel]', el), selected, { mode: 'panel', onChange: load }); },
    stock: (t) => stockDialog({ id: Number(t.dataset.id), ...d.lowStock.find((x) => x.id === Number(t.dataset.id)) }, load),
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-from], [data-to]')) {
      const a = $('[data-from]', el).value, b = $('[data-to]', el).value;
      if (a && b && a <= b) { f.preset = 'custom'; f.from = a; f.to = b; load().catch((x) => toast(x.message, true)); }
    }
  });
  el.addEventListener('input', (e) => { const k = e.target.dataset.calc; if (k) { calc[k] = e.target.value; store.set('dash-calc', calc); drawGain(); } });
  await load().catch((e) => render(el, html`<div class="notice bad">${e.message}</div>`));
  return { refresh: load, destroy: () => chart && chart.destroy() };
}
