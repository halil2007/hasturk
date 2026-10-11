// Sistem hızı (ana panel → Destek): panellerin istek süreleri (son 7 / 30 gün), en yavaş işlemler ve son otomatik bakım.
import { api, html, render, $, n, ago, dateTime, actions } from '../core.js';

const ms = (v) => (v >= 1000 ? `${(v / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn` : `${Math.round(v || 0)} ms`);
const tone = (v) => (v >= 3000 ? 'var(--bad)' : v >= 1000 ? 'var(--amber)' : 'var(--good)');

const table = (title, sub, rows, empty, warnAt = 1000) => html`<div class="card flush"><div class="card-pad card-head"><h2>${title}</h2><span class="muted small">${sub}</span></div>
  ${rows.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>İşlem</th><th>Panel</th><th class="r">İstek</th><th class="r">Ortalama</th><th class="r">En uzun</th><th class="r">1 sn+</th></tr></thead><tbody>
    ${rows.map((r) => html`<tr><td class="small"><code>${r.route}</code></td><td class="small">${r.firm}</td><td class="r num">${n(r.n)}</td><td class="r num" style="font-weight:700;color:${tone(r.avg_ms * (1000 / warnAt))}">${ms(r.avg_ms)}</td><td class="r num">${ms(r.max_ms)}</td><td class="r num">${r.slow_n ? n(r.slow_n) : '—'}</td></tr>`)}
  </tbody></table></div>` : html`<div class="empty">${empty}</div>`}</div>`;

// Veritabanı altyapısı: sunucu nerede çalışıyor, veritabanı hangi bölgede, sorgu başına gidiş-dönüş ne kadar
const PLACE = { DO: 'Ana panel nesnesi (mağaza verisi yerelde; yalnız ortak tablolar)', '?': 'bilinmiyor' };
function infraBox(d) {
  const rows = (d.infra || []).filter((x) => !x.slug).sort((a, b) => b.queries - a.queries);
  if (!rows.length) return '';
  const best = rows[0], far = rows.some((x) => x.rtt_ms >= 20);
  return html`<div class="card"><div class="card-head"><h2>Veritabanı bağlantısı (ana panel)</h2><span class="muted small">sorgu başına ortalama bekleme · ${n(best.queries)} sorgu</span></div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Sunucu → veritabanı bölgesi</th><th class="r">Sorgu</th><th class="r">Sorgu başı</th></tr></thead><tbody>
    ${rows.map((x) => { const [w, reg] = x.where.split(' → '); const place = w.startsWith('DO') ? PLACE.DO : `Kullanıcıya yakın sunucu (${w})`; return html`<tr><td class="small">${place} → <b>${reg}</b></td><td class="r num">${n(x.queries)}</td><td class="r num" style="font-weight:700;color:${x.rtt_ms >= 40 ? 'var(--bad)' : x.rtt_ms >= 15 ? 'var(--amber)' : 'var(--good)'}">${ms(x.rtt_ms)}</td></tr>`; })}
    </tbody></table></div>
    <div class="muted tiny" style="margin-top:8px">${far ? 'Ana veritabanı (yalnız firmalar, destek, hata kayıtları, blog gibi ortak tablolar) uzak bölgede; mağaza verisi (sipariş, ürün, stok, ayarlar) ana panelin kendi yerel veritabanında olduğundan bu sayılar sayfa hızını etkilemez.' : 'Sorgular veritabanının yanında çalışıyor (sorgu başına birkaç ms).'}</div></div>`;
}

// Veri taşıma doğrulaması: ana panelin verisi eski (ana) veritabanından kendi yerel veritabanına kopyalandı; tablo başına kayıt sayıları.
// Taşımadan sonra yeni kayıtlar yalnız yerele yazıldığından yerel sayı eskiye eşit ya da fazla olmalı (eski günlük / geçmiş kayıtları
// günlük bakımda temizlendiği için bu tablolarda azalma olağandır).
const PRUNED = ['logs', 'buybox_history', 'price_changes', 'notices', 'push_checks', 'mail_queue', 'jobs', 'product_uploads'];
// Ayarlar ana veritabanında da tutulur ve oraya site / Worker da yazar (giriş denemesi, deneme bağlantısı …): sayıları karşılaştırılmaz
const SHARED = ['settings'];
function migBox(m) {
  if (!m) return html`<div class="card"><div class="card-head"><h2>Veri taşıma doğrulaması</h2><button class="btn sm" data-act="mig">Doğrula</button></div><div class="muted small">Ana panelin verisi yeni, hızlı altyapıya (kendi yerel veritabanına) taşındı. "Doğrula" tablo tablo eski ve yeni kayıt sayılarını karşılaştırır.</div></div>`;
  const rows = m.tables || [], bad = rows.filter((r) => r.old != null && r.now != null && r.now < r.old && !PRUNED.includes(r.table) && !SHARED.includes(r.table));
  const tot = rows.reduce((a, r) => ({ old: a.old + (r.old || 0), now: a.now + (r.now || 0) }), { old: 0, now: 0 });
  return html`<div class="card flush"><div class="card-pad card-head"><h2>Veri taşıma doğrulaması</h2><span class="muted small">${m.at ? `taşındı: ${dateTime(m.at)} · ` : ''}${n(m.rows || 0)} kayıt kopyalandı</span></div>
    <div class="card-pad"><div class="notice ${bad.length || (m.skipped || []).length ? 'bad' : 'good'}"><i class="ico ico-${bad.length ? 'warn' : 'check'}"></i><div>${bad.length || (m.skipped || []).length
      ? html`<b>Kontrol gerekli:</b> ${bad.map((r) => r.table).concat(m.skipped || []).join(', ')}`
      : html`<b>Veri kaybı yok.</b> Tüm tablolarda yeni veritabanındaki kayıt sayısı eskisine eşit ya da fazla (taşımadan sonra gelen yeni kayıtlar). Toplam: eski ${n(tot.old)} · şimdi ${n(tot.now)}.`}</div></div></div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Tablo</th><th class="r">Eski veritabanı</th><th class="r">Yeni (yerel)</th><th class="r">Fark</th></tr></thead><tbody>
    ${rows.filter((r) => r.old || r.now).map((r) => html`<tr><td class="small"><code>${r.table}</code></td><td class="r num">${r.old == null ? '—' : n(r.old)}</td><td class="r num">${r.now == null ? '—' : n(r.now)}</td><td class="r num" style="color:${r.now < r.old ? (PRUNED.includes(r.table) || SHARED.includes(r.table) ? 'var(--muted)' : 'var(--bad)') : 'var(--good)'}">${r.old == null || r.now == null ? '—' : (r.now - r.old > 0 ? '+' : '') + n(r.now - r.old)}${SHARED.includes(r.table) ? ' (ortak)' : r.now < r.old && PRUNED.includes(r.table) ? ' (bakım)' : ''}</td></tr>`)}
    </tbody></table></div></div>`;
}

export async function perfView(el) {
  const f = { days: 7, slug: '', mig: false };
  let d = null;
  async function load() { d = await api(`perf?days=${f.days}${f.slug ? `&slug=${encodeURIComponent(f.slug)}` : ''}${f.mig ? '&mig=1' : ''}`, { fresh: true }); draw(); }
  function draw() {
    const tot = d.daily.reduce((a, x) => ({ n: a.n + x.n, slow: a.slow + x.slow_n, t: a.t + x.avg_ms * x.n }), { n: 0, slow: 0, t: 0 });
    const avg = tot.n ? tot.t / tot.n : 0, mx = Math.max(1, ...d.daily.map((x) => x.avg_ms)), m = d.maint || {};
    render(el, html`<div class="stack">
      <div class="kpis">
        <div class="kpi"><div class="label">Ortalama yanıt (panel)</div><div class="value num" style="color:${tot.n ? tone(avg) : 'inherit'}">${tot.n ? ms(avg) : '—'}</div><div class="delta flat">son ${f.days} gün</div></div>
        <div class="kpi"><div class="label">İstek</div><div class="value num">${n(tot.n)}</div><div class="delta flat">tüm paneller · pazaryeri bağlantılılar hariç</div></div>
        <div class="kpi"><div class="label">1 sn'yi aşan</div><div class="value num" style="color:${tot.slow ? 'var(--amber)' : 'var(--good)'}">${n(tot.slow)}</div><div class="delta flat">%${n(tot.n ? (tot.slow / tot.n) * 100 : 0)}</div></div>
        <div class="kpi"><div class="label">Son otomatik bakım</div><div class="value" style="font-size:18px">${m.at ? ago(m.at) : '—'}</div><div class="delta flat" title="${m.at ? dateTime(m.at) : ''}">${m.at ? `${n((m.logs || 0) + (m.buybox_history || 0) + (m.notices || 0) + (m.price_changes || 0))} eski kayıt temizlendi` : 'ilk senkronda çalışır'}</div></div>
      </div>
      <div class="row wrap" style="gap:10px"><div class="chips">${[1, 7, 30].map((k) => html`<button class="chip ${f.days === k ? 'on' : ''}" data-act="days" data-k="${k}">${k === 1 ? 'Bugün' : `Son ${k} gün`}</button>`)}</div>
        <select class="input" style="width:auto" data-slug><option value="">Tüm paneller</option>${d.firms.map((x) => html`<option value="${x.slug || '-'}" ${f.slug === (x.slug || '-') ? 'selected' : ''}>${x.firm} · ${ms(x.avg_ms)}</option>`)}</select></div>
      ${d.daily.length ? html`<div class="card"><div class="card-head"><h2>Günlük ortalama yanıt</h2></div><div class="perf-bars">${d.daily.map((x) => html`<div class="pb" title="${x.day}: ${ms(x.avg_ms)} · ${n(x.n)} istek · ${n(x.slow_n)} yavaş"><span style="height:${Math.max(4, (x.avg_ms / mx) * 100)}%;background:${tone(x.avg_ms)}"></span><small>${x.day.slice(8)}</small></div>`)}</div></div>` : ''}
      ${infraBox(d)}
      ${d.local ? migBox(d.migration) : ''}
      ${(d.pages || []).length ? html`<div class="card flush"><div class="card-pad card-head"><h2>Sayfa açılışları (kullanıcının beklediği süre)</h2><span class="muted small">menüye basıştan sayfa ekrana gelene kadar · tarayıcıda ölçülür</span></div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Sayfa</th><th>Panel</th><th class="r">Açılış</th><th class="r">Ortalama</th><th class="r">En uzun</th><th class="r">1 sn+</th></tr></thead><tbody>
        ${d.pages.map((r) => html`<tr><td class="small"><code>#/${r.route}</code></td><td class="small">${r.firm}</td><td class="r num">${n(r.n)}</td><td class="r num" style="font-weight:700;color:${tone(r.avg_ms)}">${ms(r.avg_ms)}</td><td class="r num">${ms(r.max_ms)}</td><td class="r num">${r.slow_n ? n(r.slow_n) : '—'}</td></tr>`)}
        </tbody></table></div></div>` : ''}
      ${(d.client || []).length ? html`<div class="card flush"><div class="card-pad card-head"><h2>Bekleme nereden geliyor?</h2><span class="muted small">aynı işlem için tarayıcının beklediği süre ile sunucunun çalışma süresi · aradaki fark ağ / mesafe</span></div>
        <div class="table-wrap"><table class="t"><thead><tr><th>İşlem</th><th>Panel</th><th class="r">Tarayıcı</th><th class="r">Sunucu</th><th class="r">Ağ + bekleme</th><th class="r">Sorgu</th></tr></thead><tbody>
        ${d.client.map((r) => html`<tr><td class="small"><code>${r.route}</code></td><td class="small">${r.firm}</td><td class="r num" style="font-weight:700;color:${tone(r.avg_ms)}">${ms(r.avg_ms)}</td><td class="r num">${r.server_ms != null ? ms(r.server_ms) : '—'}</td><td class="r num">${r.server_ms != null ? ms(Math.max(0, r.avg_ms - r.server_ms)) : '—'}</td><td class="r num">${r.db_q != null ? n(r.db_q) : '—'}</td></tr>`)}
        </tbody></table></div></div>` : ''}
      ${table('En yavaş işlemler (panel)', 'ortalamaya göre · sunucuda', d.routes, 'Henüz ölçüm yok. Paneller kullanıldıkça birkaç dakikada bir yazılır.')}
      ${(d.external || []).length ? table('Pazaryeri / site bağlantılı işlemler', 'süre kanalın yanıtına bağlı: senkron, paketleme, etiket, kargo bildirimi, bağlantı testi, soru cevabı …', d.external, '', 10000) : ''}
      <div class="muted tiny">Her panelin istek süreleri işlem türüne göre toplanır. Ortalaması 1 saniyeyi aşan panel işlemi (pazaryeri bağlantılı işlemde 10 saniye) "Müşteri hataları"na <b>Yavaş işlem</b> olarak düşer; sonra hızlanırsa kendiliğinden çözülür. Her gün otomatik bakım: eski günlük / buybox geçmişi / bildirimler temizlenir, veritabanı sorgu istatistikleri tazelenir (PRAGMA optimize).</div>
    </div>`);
    $('[data-slug]', el).onchange = (e) => { f.slug = e.target.value; load(); };
  }
  actions(el, { days: (b) => { f.days = Number(b.dataset.k); load(); }, mig: () => { f.mig = true; load(); } });
  await load();
  return { refresh: load };
}
