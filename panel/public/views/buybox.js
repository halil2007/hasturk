// Buybox (Trendyol ve Hepsiburada): ürünlerin buybox sırası, buybox fiyatı ve rakip fiyatları, durum bildirimleri,
// geçmiş ve otomatik fiyat kuralları. Otomatik fiyat yalnızca kural açılan ürün/kanalda ve Ayarlar'daki genel anahtar açıkken çalışır.
import { api, state, html, render, $, n, money, ch, chLogo, chBadge, thumb, actions, busy, toast, debounce, sheet, numIn, ago, dateTime, isAdmin, isMobile, activeChannels } from '../core.js';
import { setQuery, loadSummary } from '../app.js';

const STATUS = [['', 'Tümü'], ['won', 'Buybox sizde'], ['lost', 'Kaybedilen'], ['multi', 'Rakipli'], ['rules', 'Otomatik fiyat açık'], ['unchecked', 'Kontrol edilmedi']];
export const bbChannels = () => activeChannels().filter((c) => ['trendyol', 'hepsiburada'].includes(c.id) && (c.enabled || c.demo));
function bbState(r) {
  if (!r.checked_at) return ['', 'Kontrol edilmedi'];
  if (!r.rank) return ['', r.error || 'Veri yok'];
  if (r.rank === 1 && r.prev_rank && r.prev_rank !== 1) return ['good', 'Buybox kazanıldı'];
  if (r.rank === 1) return ['good', 'Buybox sizde'];
  if (r.prev_rank === 1) return ['bad', 'Birinci sırayı kaybettiniz'];
  return ['amber', `${r.rank}. sıradasınız`];
}

export async function buyboxView(el, rest, query = {}) {
  const f = { channel: query.channel || '', status: query.durum || '', q: query.q || '', page: 1 };
  let data = { rows: [], kpi: {}, total: 0 };
  const st = state.settings || {};
  render(el, html`<div class="stack">
    <div data-auto></div>
    <div class="kpis" data-kpis></div>
    <div class="row wrap"><div class="ch-tabs" style="flex:1" data-chs></div></div>
    <div class="row wrap"><div class="tabs" style="flex:1" data-tabs></div>
      <div class="search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün adı, barkod" data-q value="${f.q}"></div>
      <button class="btn" data-act="check"><i class="ico ico-sync"></i>Şimdi kontrol et</button></div>
    <div class="card flush" data-box></div>
  </div>`);

  function head() {
    const k = data.kpi, rate = k.checked ? (k.won / Math.max(1, k.won + k.lost)) * 100 : 0;
    render($('[data-auto]', el), st.autoprice
      ? html`<div class="notice good"><i class="ico ico-bolt"></i><div style="flex:1"><b>Otomatik fiyatlandırma açık.</b> Yalnızca “Otomatik fiyat” açtığınız ${n(k.rules)} üründe, belirlediğiniz en düşük / en yüksek fiyat sınırları içinde çalışır.</div>${isAdmin() ? html`<button class="btn sm" data-act="auto" data-on="0">Kapat</button>` : ''}</div>`
      : html`<div class="notice"><i class="ico ico-bolt"></i><div style="flex:1"><b>Otomatik fiyatlandırma kapalı</b> — buybox yalnızca izleniyor. Ürün bazında kural tanımlayıp burada açtığınızda yalnızca o ürünlerde çalışır.</div>${isAdmin() ? html`<button class="btn sm primary" data-act="auto" data-on="1">Aç</button>` : ''}</div>`);
    render($('[data-kpis]', el), html`
      <a class="kpi" href="#/buybox?durum=won"><div class="label">Buybox kazanan</div><div class="value num" style="color:var(--good)">${n(k.won)}</div><div class="delta flat">toplam ${n(k.total)} ilandan</div></a>
      <a class="kpi" href="#/buybox?durum=lost"><div class="label">Buybox kaybedilen</div><div class="value num ${k.lost ? 'down' : ''}">${n(k.lost)}</div><div class="delta flat">rakipler önde</div></a>
      <a class="kpi" href="#/buybox?durum=multi"><div class="label">Rakipli ürün</div><div class="value num">${n(k.multi)}</div><div class="delta flat">birden fazla satıcı</div></a>
      <div class="kpi"><div class="label">Kazanma oranı</div><div class="value num">%${n(rate)}</div><div class="delta flat">${n(k.won)} / ${n(k.won + k.lost)} · ${n(k.checked)} kontrol edildi</div></div>`);
    const chs = bbChannels();
    render($('[data-chs]', el), html`<button class="ch-tab ${!f.channel ? 'on' : ''}" data-act="ch" data-id=""><i class="ico ico-grid"></i>Trendyol + Hepsiburada</button>${chs.map((c) => html`<button class="ch-tab ${f.channel === c.id ? 'on' : ''}" data-act="ch" data-id="${c.id}">${chLogo(c.id)}${c.name}</button>`)}`);
    render($('[data-tabs]', el), html`${STATUS.map(([k2, t]) => html`<button class="tab ${f.status === k2 ? 'on' : ''}" data-act="st" data-k="${k2}">${t}</button>`)}`);
  }
  const priceCell = (r) => html`<div class="num" style="font-weight:700">${money(r.price)}</div>${r.rule_on ? html`<div class="tiny muted">${money(r.min_price)} – ${money(r.max_price)}</div>` : ''}`;
  const bbCell = (r) => (r.buybox_price ? html`<div class="num" style="font-weight:650">${money(r.buybox_price)}</div><div class="tiny ${r.rank === 1 ? 'muted' : ''}" style="${r.rank > 1 && r.price > r.buybox_price ? 'color:var(--bad)' : ''}">${r.rank === 1 ? (r.second_price ? `2.: ${money(r.second_price)}` : 'tek satıcı') : `fark ${money(r.price - r.buybox_price)}`}</div>` : html`<span class="muted">—</span>`);
  function draw() {
    head();
    const rows = data.rows;
    const body = !rows.length ? html`<div class="empty">${data.kpi.total ? 'Bu filtrede ürün yok' : 'Trendyol / Hepsiburada ilanı yok. Önce Entegrasyonlar\'dan ilanları çekin.'}</div>`
      : isMobile() ? html`<div class="m-list" style="padding:12px">${rows.map((r) => { const [c, t] = bbState(r); return html`<div class="m-card" data-key="${r.channel}|${r.remote_id}">
          <div class="top">${thumb(r.image, r.name, 'sm')}<div style="min-width:0;flex:1"><div class="ellipsis" style="font-weight:650">${r.product_name || r.name}</div><div class="muted tiny">${chBadge(r.channel)} ${r.barcode || ''}</div></div>${r.rank ? html`<span class="rank ${r.rank === 1 ? 'one' : ''}">#${r.rank}</span>` : ''}</div>
          <div class="row wrap"><span class="pill ${c}">${t}</span>${r.rule_on ? html`<span class="pill info">Otomatik fiyat</span>` : ''}</div>
          <div class="row small"><span>Fiyatımız <b>${money(r.price)}</b></span><span class="spacer"></span><span>Buybox <b>${r.buybox_price ? money(r.buybox_price) : '—'}</b></span></div>
          <div class="row"><span class="muted tiny" style="flex:1">${r.checked_at ? `kontrol ${ago(r.checked_at)}` : ''}</span><button class="btn sm" data-act="detail">Geçmiş</button><button class="btn sm ${r.rule_on ? 'primary' : ''}" data-act="rule">Kural</button></div></div>`; })}</div>`
        : html`<div class="table-wrap"><table class="t"><thead><tr><th>Ürün</th><th>Kanal</th><th class="c">Sıra</th><th class="r">Fiyatımız</th><th class="r">Buybox fiyatı</th><th class="r col-cust">3. fiyat</th><th>Durum</th><th class="col-cust">Son kontrol</th><th class="c">Otomatik fiyat</th><th></th></tr></thead><tbody>
          ${rows.map((r) => { const [c, t] = bbState(r); return html`<tr data-key="${r.channel}|${r.remote_id}">
            <td><div class="row">${thumb(r.image, r.name, 'sm')}<div style="min-width:0"><div class="ellipsis" style="max-width:300px;font-weight:650">${r.product_name || r.name}</div><div class="muted tiny">${r.barcode || r.remote_id}</div></div></div></td>
            <td>${chBadge(r.channel)}</td><td class="c">${r.rank ? html`<span class="rank ${r.rank === 1 ? 'one' : ''}">#${r.rank}</span>` : html`<span class="muted">—</span>`}</td>
            <td class="r">${priceCell(r)}</td><td class="r">${bbCell(r)}</td><td class="r num muted col-cust">${r.third_price ? money(r.third_price) : '—'}</td>
            <td><span class="pill ${c}">${t}</span>${r.multi === 0 ? html`<div class="tiny muted">rakip yok</div>` : ''}</td>
            <td class="small muted col-cust" title="${dateTime(r.checked_at)}">${r.checked_at ? ago(r.checked_at) : '—'}${r.last_change ? html`<div class="tiny">fiyat ${ago(r.last_change)} değişti</div>` : ''}</td>
            <td class="c"><button class="btn sm ${r.rule_on ? 'primary' : ''}" data-act="rule">${r.rule_on ? 'Açık' : 'Kapalı'}</button></td>
            <td class="r"><button class="btn sm ghost" data-act="detail">Geçmiş</button></td></tr>`; })}
        </tbody></table></div>`;
    render($('[data-box]', el), html`${body}<div class="pager"><span class="muted small" style="margin-right:auto">${n(data.total)} ilan</span>${rows.length < data.total ? html`<button class="btn sm" data-act="more">Daha fazla</button>` : ''}</div>`);
  }
  async function load(append = false) {
    setQuery({ channel: f.channel, durum: f.status, q: f.q });
    const p = new URLSearchParams({ page: f.page, limit: 50 });
    if (f.channel) p.set('channel', f.channel);
    if (f.status) p.set('status', f.status);
    if (f.q) p.set('q', f.q);
    const r = await api('buybox?' + p);
    data = { ...r, rows: append ? data.rows.concat(r.rows) : r.rows };
    draw();
  }
  const refresh = () => { f.page = 1; return load().catch((e) => toast(e.message, true)); };
  const keyOf = (t) => { const [channel, ...r] = t.closest('[data-key]').dataset.key.split('|'); return { channel, remote_id: r.join('|') }; };
  actions(el, {
    ch: (t) => { f.channel = t.dataset.id; refresh(); },
    st: (t) => { f.status = t.dataset.k; refresh(); },
    more: (t) => busy(t, async () => { f.page++; await load(true); }),
    check: (t) => busy(t, async () => { const r = await api('buybox/check', { method: 'POST', body: { channel: f.channel || undefined, limit: 200 } }); toast(Object.entries(r).map(([k, v]) => `${ch(k).name}: ${typeof v === 'number' ? `${v} ürün kontrol edildi` : v}`).join(' · ') || 'Kontrol edilecek ilan yok'); refresh(); }),
    auto: (t) => busy(t, async () => {
      const on = t.dataset.on === '1';
      await api('settings', { method: 'PUT', body: { autoprice: on } });
      st.autoprice = on; await loadSummary().catch(() => {});
      toast(on ? 'Otomatik fiyatlandırma açıldı (yalnızca kural açık ürünlerde)' : 'Otomatik fiyatlandırma kapatıldı'); draw();
    }),
    rule: (t) => ruleDialog(keyOf(t), refresh),
    detail: (t) => detail(keyOf(t), refresh),
  });
  $('[data-q]', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); refresh(); }, 300));
  await refresh();
  return { refresh };
}

// Otomatik fiyat kuralı (ürün + kanal)
async function ruleDialog(key, done) {
  const d = await api(`buybox/item?channel=${key.channel}&remote_id=${encodeURIComponent(key.remote_id)}`);
  const r = d.rule || {}, l = d.listing, b = d.buybox || {};
  const s = sheet({
    title: `${ch(key.channel).name} · otomatik fiyat`, size: 'narrow',
    body: html`<form class="stack" data-f>
      <div class="row">${thumb(l.product_image || l.image, l.name, 'sm')}<div style="min-width:0"><div class="ellipsis" style="font-weight:650">${l.product_name || l.name}</div><div class="muted tiny">Fiyatımız ${money(l.price)}${b.rank ? ` · ${b.rank}. sıra · buybox ${money(b.buybox_price)}` : ''}</div></div></div>
      <label class="check"><span class="switch"><input type="checkbox" name="enabled" ${r.enabled ? 'checked' : ''} ${isAdmin() ? '' : 'disabled'}><span></span></span> Bu ürün ve kanalda otomatik fiyat açık</label>
      <div class="form-grid">
        <label class="field"><span>En düşük satış fiyatı</span><div class="input-group"><input class="input" name="min_price" inputmode="decimal" value="${r.min_price ?? ''}" required><span class="suffix">₺</span></div></label>
        <label class="field"><span>En yüksek satış fiyatı</span><div class="input-group"><input class="input" name="max_price" inputmode="decimal" value="${r.max_price ?? ''}" required><span class="suffix">₺</span></div></label>
        <label class="field"><span>Normal (hedef) fiyat</span><div class="input-group"><input class="input" name="target_price" inputmode="decimal" value="${r.target_price ?? l.price ?? ''}"><span class="suffix">₺</span></div></label>
        <label class="field"><span>Rakibin kaç TL altına inilsin</span><div class="input-group"><input class="input" name="step" inputmode="decimal" value="${r.step ?? 5}"><span class="suffix">₺</span></div></label>
      </div>
      <div class="notice small" data-preview></div>
      <div class="muted small">Örnek: normal fiyat 3.000 ₺, fark 5 ₺. Rakip 2.995 ₺'ye inerse fiyatınız 2.990 ₺ olur; en düşük fiyatın altına inilmez. Rakip çekilir ya da fiyatını yükseltirse fiyat normal fiyata (en fazla en yüksek fiyata) geri döner. Rakip verisi alınamazsa veya güncel değilse fiyat değiştirilmez. Her değişiklik geçmişte saklanır.</div>
      ${!(state.settings || {}).autoprice ? html`<div class="notice warn small">Genel anahtar kapalı: kural kaydedilir ama Buybox sayfasında “Aç” denene kadar fiyat değişmez.</div>` : ''}
    </form>`,
    foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button>${isAdmin() ? html`<button class="btn primary" data-save>Kaydet</button>` : ''}`,
  });
  const fm = $('[data-f]', s.el);
  // Mevcut buybox durumuna göre önizleme (sunucudaki kararla aynı kurallar)
  const preview = () => {
    const v = { min: numIn(fm.min_price.value), max: numIn(fm.max_price.value), target: numIn(fm.target_price.value) || numIn(fm.max_price.value), step: numIn(fm.step.value) };
    let txt;
    if (!b.rank) txt = 'Buybox verisi henüz yok: ilk kontrolden sonra çalışır.';
    else if (!(v.min > 0) || v.max < v.min) txt = 'En düşük ve en yüksek fiyatı girin.';
    else if (b.rank === 1) { const c = b.multi && b.second_price ? b.second_price : null; const want = Math.min(v.max, c ? Math.min(v.target, c - v.step) : v.target); txt = want > l.price ? `Buybox sizde → fiyat ${money(want)} olur (yükseltme).` : 'Buybox sizde → değişiklik gerekmez.'; }
    else { const want = Math.max(v.min, b.buybox_price - v.step); txt = want < l.price ? `Rakip ${money(b.buybox_price)} → fiyatınız ${money(Math.min(v.max, want))} olur.` : 'Fiyatınız zaten rakibin altında/sınırda → değişiklik yok.'; }
    $('[data-preview]', s.el).textContent = 'Şu anki duruma göre: ' + txt;
  };
  fm.addEventListener('input', preview); preview();
  const save = $('[data-save]', s.el);
  if (save) save.onclick = (e) => busy(e.currentTarget, async () => {
    await api('price-rules', { method: 'PUT', body: { channel: key.channel, remote_id: key.remote_id, enabled: fm.enabled.checked, min_price: numIn(fm.min_price.value), max_price: numIn(fm.max_price.value), target_price: numIn(fm.target_price.value), step: numIn(fm.step.value) } });
    toast('Kural kaydedildi'); s.close(); done();
  });
}

// Sıralama ve fiyat değişikliği geçmişi
async function detail(key) {
  const s = sheet({ title: 'Buybox geçmişi', size: 'wide drawer', body: html`<div class="empty"><i class="ico ico-sync spin"></i></div>` });
  const d = await api(`buybox/item?channel=${key.channel}&remote_id=${encodeURIComponent(key.remote_id)}`);
  const EV = { sizde: ['good', 'Buybox sizde'], rakipte: ['amber', 'Buybox rakipte'], kazanildi: ['good', 'Buybox kazanıldı'], kaybedildi: ['bad', 'Birinci sırayı kaybettiniz'], sira: ['', 'Sıra değişti'] };
  s.title.textContent = `${ch(key.channel).name} · ${d.listing.product_name || d.listing.name}`;
  s.setBody(html`<div class="two-col">
    <div class="card flush"><div class="card-pad"><h3>Sıralama geçmişi</h3></div>${d.history.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Zaman</th><th class="c">Sıra</th><th class="r">Fiyatımız</th><th class="r">Buybox</th><th></th></tr></thead><tbody>
      ${d.history.map((h) => html`<tr><td class="small">${dateTime(h.at)}</td><td class="c">${h.rank ? html`<span class="rank ${h.rank === 1 ? 'one' : ''}">#${h.rank}</span>` : '—'}</td><td class="r num">${money(h.our_price)}</td><td class="r num">${money(h.buybox_price)}</td><td>${h.event && EV[h.event] ? html`<span class="pill ${EV[h.event][0]}">${EV[h.event][1]}</span>` : ''}</td></tr>`)}
    </tbody></table></div>` : html`<div class="empty">Henüz kayıt yok</div>`}</div>
    <div class="card flush"><div class="card-pad"><h3>Fiyat değişiklikleri</h3></div>${d.changes.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Zaman</th><th class="r">Eski → yeni</th><th>Neden</th><th class="c">Sonra</th></tr></thead><tbody>
      ${d.changes.map((c) => html`<tr><td class="small">${dateTime(c.at)}</td><td class="r num">${money(c.old_price)} → <b>${money(c.new_price)}</b></td><td class="small">${c.ok ? c.reason : html`<span style="color:var(--bad)">Gönderilemedi: ${c.error}</span>`}</td><td class="c">${c.rank_after ? html`<span class="rank ${c.rank_after === 1 ? 'one' : ''}">#${c.rank_after}</span>` : html`<span class="muted tiny">bekleniyor</span>`}</td></tr>`)}
    </tbody></table></div>` : html`<div class="empty">Otomatik fiyat değişikliği yapılmadı</div>`}</div>
  </div>`);
}
