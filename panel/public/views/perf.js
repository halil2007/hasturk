// Sistem hızı (ana panel → Destek): panellerin istek süreleri (son 7 / 30 gün), en yavaş işlemler ve son otomatik bakım.
import { api, html, render, $, n, ago, dateTime, actions } from '../core.js';

const ms = (v) => (v >= 1000 ? `${(v / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn` : `${Math.round(v || 0)} ms`);
const tone = (v) => (v >= 3000 ? 'var(--bad)' : v >= 1000 ? 'var(--amber)' : 'var(--good)');

export async function perfView(el) {
  const f = { days: 7, slug: '' };
  let d = null;
  async function load() { d = await api(`perf?days=${f.days}${f.slug ? `&slug=${encodeURIComponent(f.slug)}` : ''}`, { fresh: true }); draw(); }
  function draw() {
    const tot = d.daily.reduce((a, x) => ({ n: a.n + x.n, slow: a.slow + x.slow_n, t: a.t + x.avg_ms * x.n }), { n: 0, slow: 0, t: 0 });
    const avg = tot.n ? tot.t / tot.n : 0, mx = Math.max(1, ...d.daily.map((x) => x.avg_ms)), m = d.maint || {};
    render(el, html`<div class="stack">
      <div class="kpis">
        <div class="kpi"><div class="label">Ortalama yanıt</div><div class="value num" style="color:${tot.n ? tone(avg) : 'inherit'}">${tot.n ? ms(avg) : '—'}</div><div class="delta flat">son ${f.days} gün</div></div>
        <div class="kpi"><div class="label">İstek</div><div class="value num">${n(tot.n)}</div><div class="delta flat">tüm paneller</div></div>
        <div class="kpi"><div class="label">1 sn'yi aşan</div><div class="value num" style="color:${tot.slow ? 'var(--amber)' : 'var(--good)'}">${n(tot.slow)}</div><div class="delta flat">%${n(tot.n ? (tot.slow / tot.n) * 100 : 0)}</div></div>
        <div class="kpi"><div class="label">Son otomatik bakım</div><div class="value" style="font-size:18px">${m.at ? ago(m.at) : '—'}</div><div class="delta flat" title="${m.at ? dateTime(m.at) : ''}">${m.at ? `${n((m.logs || 0) + (m.buybox_history || 0) + (m.notices || 0) + (m.price_changes || 0))} eski kayıt temizlendi` : 'ilk senkronda çalışır'}</div></div>
      </div>
      <div class="row wrap" style="gap:10px"><div class="chips">${[7, 30].map((k) => html`<button class="chip ${f.days === k ? 'on' : ''}" data-act="days" data-k="${k}">Son ${k} gün</button>`)}</div>
        <select class="input" style="width:auto" data-slug><option value="">Tüm paneller</option>${d.firms.map((x) => html`<option value="${x.slug || '-'}" ${f.slug === (x.slug || '-') ? 'selected' : ''}>${x.firm} · ${ms(x.avg_ms)}</option>`)}</select></div>
      ${d.daily.length ? html`<div class="card"><div class="card-head"><h2>Günlük ortalama yanıt</h2></div><div class="perf-bars">${d.daily.map((x) => html`<div class="pb" title="${x.day}: ${ms(x.avg_ms)} · ${n(x.n)} istek · ${n(x.slow_n)} yavaş"><span style="height:${Math.max(4, (x.avg_ms / mx) * 100)}%;background:${tone(x.avg_ms)}"></span><small>${x.day.slice(8)}</small></div>`)}</div></div>` : ''}
      <div class="card flush"><div class="card-pad card-head"><h2>En yavaş işlemler</h2><span class="muted small">ortalamaya göre</span></div>
        ${d.routes.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>İşlem</th><th>Panel</th><th class="r">İstek</th><th class="r">Ortalama</th><th class="r">En uzun</th><th class="r">1 sn+</th></tr></thead><tbody>
          ${d.routes.map((r) => html`<tr><td class="small"><code>${r.route}</code></td><td class="small">${r.firm}</td><td class="r num">${n(r.n)}</td><td class="r num" style="font-weight:700;color:${tone(r.avg_ms)}">${ms(r.avg_ms)}</td><td class="r num">${ms(r.max_ms)}</td><td class="r num">${r.slow_n ? n(r.slow_n) : '—'}</td></tr>`)}
        </tbody></table></div>` : html`<div class="empty">Henüz ölçüm yok. Paneller kullanıldıkça birkaç dakikada bir yazılır.</div>`}</div>
      <div class="muted tiny">Her panelin istek süreleri işlem türüne göre toplanır. Ortalaması 3 saniyeyi aşan işlem "Müşteri hataları"na <b>Yavaş işlem</b> olarak düşer. Her gün otomatik bakım: eski günlük / buybox geçmişi / bildirimler temizlenir, veritabanı sorgu istatistikleri tazelenir (PRAGMA optimize).</div>
    </div>`);
    $('[data-slug]', el).onchange = (e) => { f.slug = e.target.value; load(); };
  }
  actions(el, { days: (b) => { f.days = Number(b.dataset.k); load(); } });
  await load();
  return { refresh: load };
}
