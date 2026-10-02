// Özet: bugünün cirosu, bekleyen işler, kanal durumu, son 14 gün grafiği, kritik stok.
import { api, state, html, render, $, money, money0, compact, pct, delta, ago, ch, chColor, statusPill, actions, busy, toast } from '../core.js';
import { columnChart, legend } from '../chart.js';
import { openOrder } from './orders.js';
import { setPending } from '../app.js';

export async function dashboard(el) {
  let chart = null;
  const hidden = new Set();
  async function load() {
    const s = await api('summary');
    state.summary = s; state.channels = s.channels; state.settings = s.settings;
    setPending(s.pending.filter((p) => p.status === 'new').reduce((a, p) => a + p.n, 0));
    const sum = (o, k) => Object.values(o).reduce((a, x) => a + (x[k] || 0), 0);
    const todayRev = sum(s.today, 'revenue'), yRev = sum(s.yesterday, 'revenue');
    const todayN = sum(s.today, 'orders'), yN = sum(s.yesterday, 'orders');
    const newN = s.pending.filter((p) => p.status === 'new').reduce((a, p) => a + p.n, 0);
    const procN = s.pending.filter((p) => p.status === 'processing').reduce((a, p) => a + p.n, 0);
    const recent = await api('orders?status=new&limit=6');
    const d = delta(todayRev, yRev), dn = delta(todayN, yN);
    const cls = (v) => (v == null || v === 0 ? 'flat' : v > 0 ? 'up' : 'down');
    const anyEnabled = s.channels.some((c) => c.enabled);
    const noProducts = s.channels.every((c) => !c.listings);
    render(el, html`
      ${!anyEnabled ? html`<div class="notice warn" style="margin-bottom:14px"><i class="ico ico-warn"></i><div>Henüz hiçbir satış kanalı bağlı değil. API anahtarlarını Cloudflare'de tanımlayın (<a href="#/ayarlar">Ayarlar</a> sayfasında hangi anahtarların gerektiği yazıyor).</div></div>` : ''}
      ${anyEnabled && noProducts ? html`<div class="notice" style="margin-bottom:14px"><div style="flex:1">İlk adım: kanallardaki ürünleri içe aktarın; aynı SKU/barkodlu ürünler otomatik eşleşir ve stok senkronu buna göre çalışır.</div><a class="btn sm primary" href="#/urunler/ice-aktar">İçe aktar</a></div>` : ''}
      ${s.settings && !s.settings.stock_sync && !noProducts ? html`<div class="notice warn" style="margin-bottom:14px"><i class="ico ico-warn"></i><div style="flex:1">Stok senkronu kapalı: satışlar stoktan düşmüyor ve kanallara gönderilmiyor. Ürün eşleştirmelerini kontrol ettikten sonra açın.</div><a class="btn sm" href="#/ayarlar">Ayarlar</a></div>` : ''}
      <div class="kpis">
        <div class="kpi hero"><div class="label">Bugünkü ciro</div><div class="value num">${money0(todayRev)}</div><div class="delta ${cls(d)}">${pct(d)} <span class="muted">dün ${money0(yRev)}</span></div></div>
        <div class="kpi"><div class="label">Bugünkü sipariş</div><div class="value num">${todayN}</div><div class="delta ${cls(dn)}">${pct(dn)} <span class="muted">dün ${yN}</span></div></div>
        <a class="kpi" href="#/siparisler"><div class="label">Bekleyen sipariş</div><div class="value num">${newN + procN}</div><div class="delta flat">${newN} yeni · ${procN} hazırlanıyor</div></a>
        <a class="kpi" href="#/urunler/kritik"><div class="label">Kritik stok</div><div class="value num ${s.lowStock.length ? 'down' : ''}">${s.lowStock.length}</div><div class="delta flat">${s.unlinked ? `${s.unlinked} eşleşmemiş ilan` : 'ürün'}</div></a>
      </div>

      <div class="section-title"><h2>Kanallar</h2><span class="muted small">bugün</span></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,200px),1fr))">
        ${s.channels.map((c) => {
          const t = s.today[c.id] || { orders: 0, revenue: 0 };
          const last = c.last;
          const st = !c.enabled ? html`<span class="pill">Bağlı değil</span>` : c.demo ? html`<span class="pill warn">Deneme</span>` : last && !last.ok ? html`<span class="pill bad" title="${last.error}">Hata</span>` : html`<span class="pill good">Bağlı</span>`;
          return html`<a class="kpi" href="#/siparisler/kanal/${c.id}" style="border-top:3px solid ${chColor(c.id)}">
            <div class="row"><span class="label ellipsis" style="flex:1">${c.name}</span>${st}</div>
            <div class="value num" style="font-size:20px">${money0(t.revenue)}</div>
            <div class="delta flat">${t.orders} sipariş${last ? html` · ${ago(last.at)}` : ''}</div></a>`;
        })}
      </div>

      <div class="section-title"><h2>Son 14 gün</h2><a class="btn sm ghost" href="#/istatistik">Detaylı istatistik</a></div>
      <div class="card"><div data-legend></div><div data-chart></div></div>

      <div class="two-col" style="margin-top:22px">
        <div>
          <div class="section-title" style="margin-top:0"><h2>Yeni siparişler</h2><a class="btn sm ghost" href="#/siparisler">Tümü</a></div>
          <div class="list">
            ${recent.orders.length ? recent.orders.map((o) => html`<div class="o-card" data-act="open" data-id="${o.id}" style="grid-template-columns:1fr auto">
              <div class="main"><div class="o-head"><span class="dot" style="background:${chColor(o.channel)}"></span><span class="o-no">${o.order_number}</span><span class="muted small">${ago(o.ordered_at)}</span></div>
                <div class="small ellipsis">${o.customer}${o.city ? ` · ${o.city}` : ''}</div><div class="muted small ellipsis">${o.preview}</div></div>
              <div style="text-align:right"><div class="amount num">${money(o.total)}</div><button class="btn sm" data-act="accept" data-id="${o.id}" style="margin-top:6px">İşleme al</button></div>
            </div>`) : html`<div class="card empty">Yeni sipariş yok</div>`}
          </div>
        </div>
        <div>
          <div class="section-title" style="margin-top:0"><h2>Kritik stok</h2><a class="btn sm ghost" href="#/urunler/kritik">Tümü</a></div>
          <div class="card flush">${s.lowStock.length ? html`<table class="t"><tbody>${s.lowStock.slice(0, 8).map((p) => html`<tr><td class="ellipsis" style="max-width:220px">${p.name}<div class="muted tiny">${p.sku || ''}</div></td><td class="r num ${p.stock <= 0 ? 'down' : 'up'}" style="font-weight:700;color:${p.stock <= 0 ? 'var(--bad)' : 'var(--warn)'}">${p.stock}</td></tr>`)}</tbody></table>` : html`<div class="empty">Kritik stokta ürün yok</div>`}</div>
        </div>
      </div>`);
    // Grafik
    const ids = s.channels.map((c) => c.id);
    const draw = () => {
      const series = ids.filter((id) => !hidden.has(id)).map((id) => ({ id, name: ch(id).name, color: chColor(id), values: s.last14.series.map((b) => b.revenue[id]) }));
      legend($('[data-legend]', el), ids.map((id) => ({ id, name: ch(id).name, color: chColor(id) })), hidden, (id) => { hidden.has(id) ? hidden.delete(id) : hidden.add(id); draw(); });
      if (chart) chart.destroy();
      chart = columnChart($('[data-chart]', el), {
        title: 'Son 14 gün ciro', labels: s.last14.series.map((b) => b.key.slice(8, 10) + '.' + b.key.slice(5, 7)),
        titles: s.last14.series.map((b) => new Date(b.key + 'T12:00:00Z').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })),
        series, format: money0, axisFormat: compact, height: 220,
      });
    };
    draw();
  }
  actions(el, {
    open: (t) => openOrder(t.dataset.id, load),
    accept: (t) => { busy(t, async () => { const r = await api(`orders/${encodeURIComponent(t.dataset.id)}/accept`, { method: 'POST', body: {} }); toast(r.message); load(); }); },
  });
  await load().catch((e) => render(el, html`<div class="notice bad">${e.message}</div>`));
  return { refresh: load, destroy: () => chart && chart.destroy() };
}
