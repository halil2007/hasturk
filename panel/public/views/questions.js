// Müşteri soruları: pazaryerlerinden (Trendyol, Hepsiburada …) gelen ürün soruları her senkronda çekilir;
// burada listelenir ve panelden cevaplanır. Kanalın kendi panelinden verilen cevaplar da görünür.
import { api, state, html, render, $, n, ch, chBadge, chLogo, thumb, actions, busy, toast, debounce, sheet, ago, dateTime, isAdmin, activeChannels } from '../core.js';
import { setQuery, loadSummary } from '../app.js';

const TABS = [['waiting', 'Cevap bekleyen'], ['answered', 'Cevaplanan'], ['rejected', 'Reddedilen'], ['', 'Tümü']];
export const qChannels = () => activeChannels().filter((c) => (c.enabled || c.demo) && c.caps && c.caps.answer);

export async function questionsView(el, rest, query = {}) {
  const f = { status: query.durum ?? 'waiting', channel: query.channel || '', q: query.q || '', page: 1 };
  let data = { rows: [], counts: {}, total: 0 };
  render(el, html`<div class="stack">
    <div class="row wrap"><div class="ch-tabs" style="flex:1" data-chs></div></div>
    <div class="row wrap"><div class="tabs" style="flex:1" data-tabs></div>
      <div class="search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Soru, ürün veya müşteri" data-q value="${f.q}"></div>
      <button class="btn" data-act="sync"><i class="ico ico-sync"></i>Soruları yenile</button>${isAdmin() ? html`<button class="btn ghost" data-act="tpl">Hazır cevaplar</button>` : ''}</div>
    <div data-stats></div>
    <div data-box></div>
  </div>`);
  const tpls = () => (state.settings && state.settings.answer_templates) || [];
  const lim = (c) => (ch(c).caps && ch(c).caps.answer) || { min: 1, max: 2000 };
  function card(r) {
    const L = lim(r.channel), late = r.status === 'waiting' && r.due_at && r.due_at - Date.now() < 12 * 3600e3;
    return html`<div class="card stack qcard" data-key="${r.channel}|${r.remote_id}">
      <div class="row" style="align-items:flex-start">${thumb(r.image, r.product_name, 'sm')}
        <div style="min-width:0;flex:1"><div class="ellipsis" style="font-weight:650">${/^https?:\/\//i.test(r.product_url || '') ? html`<a class="link" href="${r.product_url}" target="_blank" rel="noopener">${r.product_name || 'Ürün'}</a>` : r.product_name || 'Ürün'}</div>
          <div class="row small muted wrap" style="gap:10px">${chBadge(r.channel)}<span>${r.customer || 'Müşteri'}</span><span title="${dateTime(r.asked_at)}">${ago(r.asked_at)}</span>${r.barcode ? html`<span>${r.barcode}</span>` : ''}</div></div>
        ${r.status === 'waiting' ? html`<span class="pill ${late ? 'bad' : 'warn'}">${late ? 'Süre doluyor' : 'Cevap bekliyor'}</span>` : r.status === 'answered' ? html`<span class="pill good">Cevaplandı</span>` : html`<span class="pill">${r.remote_status || r.status}</span>`}</div>
      <div class="qtext">${r.text}</div>
      ${r.answer ? html`<div class="qans"><div class="tiny muted" style="margin-bottom:4px">${r.answered_by === 'panel' ? `Panelden cevaplandı${r.user ? ` (${r.user})` : ''}` : `${ch(r.channel).name} panelinden cevaplandı`}${r.answered_at ? ` · ${dateTime(r.answered_at)}` : ''}</div>${r.answer}</div>` : ''}
      ${r.status === 'waiting' ? html`
        ${r.error ? html`<div class="notice bad small">${r.error}</div>` : ''}
        ${tpls().length ? html`<div class="row wrap" style="gap:6px">${tpls().map((t, i) => html`<button class="chip" data-act="usetpl" data-i="${i}" title="${t}">${t.length > 34 ? t.slice(0, 34) + '…' : t}</button>`)}</div>` : ''}
        <textarea class="input" data-ans maxlength="${L.max}" placeholder="Cevabınız (${L.min}–${L.max} karakter). Gönderilen cevap ${ch(r.channel).name}'da müşteriye görünür."></textarea>
        <div class="row"><span class="cnt" data-cnt>0 / ${L.max}</span><span class="spacer"></span>${r.due_at ? html`<span class="muted tiny">son cevap: ${dateTime(r.due_at)}</span>` : ''}<button class="btn primary" data-act="answer"><i class="ico ico-check"></i>Cevapla</button></div>` : ''}
    </div>`;
  }
  // Son 30 gün kanal bazında soru analizi
  const dur = (ms) => (!ms ? '—' : ms < 3600e3 ? `${Math.max(1, Math.round(ms / 60e3))} dk` : ms < 2 * 864e5 ? `${Math.round(ms / 3600e3)} sa` : `${Math.round(ms / 864e5)} gün`);
  function drawStats() {
    const st = (data.stats || []).filter((x) => !f.channel || x.channel === f.channel);
    render($('[data-stats]', el), st.length ? html`<div class="card flush"><div class="card-pad card-head"><h2>Soru analizi</h2><span class="muted small">son 30 gün</span></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Kanal</th><th class="r">Soru</th><th class="r">Bekleyen</th><th class="r">Cevaplanma</th><th class="r">Ort. cevap süresi</th><th class="r">Panelden</th></tr></thead><tbody>
      ${st.map((x) => html`<tr><td>${chBadge(x.channel)}</td><td class="r num">${n(x.total)}</td><td class="r num" style="color:${x.waiting ? 'var(--bad)' : 'inherit'};font-weight:650">${n(x.waiting)}</td>
        <td class="r num">%${n(x.total ? (x.answered / x.total) * 100 : 0)}</td><td class="r num">${dur(x.avg_ms)}</td><td class="r num">${n(x.by_panel)}</td></tr>`)}
      </tbody></table></div></div>` : '');
  }
  function draw() {
    drawStats();
    const c = data.counts, total = Object.values(c).reduce((a, x) => a + x, 0);
    const chs = qChannels();
    render($('[data-chs]', el), html`<button class="ch-tab ${!f.channel ? 'on' : ''}" data-act="ch" data-id=""><i class="ico ico-grid"></i>Tüm kanallar</button>${chs.map((x) => html`<button class="ch-tab ${f.channel === x.id ? 'on' : ''}" data-act="ch" data-id="${x.id}">${chLogo(x.id)}${x.name}</button>`)}`);
    render($('[data-tabs]', el), html`${TABS.map(([k, t]) => html`<button class="tab ${f.status === k ? 'on' : ''}" data-act="st" data-k="${k}">${t}<span class="n">${n(k ? c[k] || 0 : total)}</span></button>`)}`);
    render($('[data-box]', el), !chs.length ? html`<div class="card"><div class="empty">Müşteri sorularını destekleyen bağlı kanal yok. Trendyol, Hepsiburada, N11, idefix ya da Pazarama bağlanıp bağlantı testi geçince sorular burada görünür (Entegrasyonlar).</div></div>`
      : !data.rows.length ? html`<div class="card"><div class="empty">${f.status === 'waiting' ? 'Cevap bekleyen soru yok 🎉' : 'Kayıt yok'}</div></div>`
        : html`<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,520px),1fr));gap:12px">${data.rows.map(card)}</div>
          <div class="pager"><span class="muted small" style="margin-right:auto">${n(data.total)} soru</span>${data.rows.length < data.total ? html`<button class="btn sm" data-act="more">Daha fazla</button>` : ''}</div>`);
  }
  async function load(append = false) {
    setQuery({ durum: f.status === 'waiting' ? '' : f.status || 'all', channel: f.channel, q: f.q });
    const p = new URLSearchParams({ page: f.page, limit: 30 });
    if (f.status) p.set('status', f.status);
    if (f.channel) p.set('channel', f.channel);
    if (f.q) p.set('q', f.q);
    const r = await api('questions?' + p);
    data = { ...r, rows: append ? data.rows.concat(r.rows) : r.rows };
    draw();
  }
  const refresh = () => { f.page = 1; return load().catch((e) => toast(e.message, true)); };
  const keyOf = (t) => { const [channel, ...r] = t.closest('[data-key]').dataset.key.split('|'); return { channel, remote_id: r.join('|') }; };
  actions(el, {
    ch: (t) => { f.channel = t.dataset.id; refresh(); },
    st: (t) => { f.status = t.dataset.k; refresh(); },
    more: (t) => busy(t, async () => { f.page++; await load(true); }),
    sync: (t) => busy(t, async () => { const r = await api('questions/sync', { method: 'POST' }); toast(Object.entries(r).map(([k, v]) => `${ch(k).name}: ${typeof v === 'number' ? `${v} soru kontrol edildi` : v}`).join(' · ') || 'Soru destekleyen kanal yok'); await loadSummary().catch(() => {}); refresh(); }),
    usetpl: (t) => { const ta = $('[data-ans]', t.closest('[data-key]')); ta.value = (ta.value ? ta.value + ' ' : '') + tpls()[Number(t.dataset.i)]; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus(); },
    answer: (t) => busy(t, async () => {
      const k = keyOf(t), text = $('[data-ans]', t.closest('[data-key]')).value.trim();
      await api(`questions/${k.channel}/${encodeURIComponent(k.remote_id)}/answer`, { method: 'POST', body: { text } });
      toast(`Cevap ${ch(k.channel).name}'a gönderildi`); await loadSummary().catch(() => {}); refresh();
    }),
    tpl: () => templates(refresh),
  });
  el.addEventListener('input', (e) => {
    if (!e.target.matches('[data-ans]')) return;
    const box = e.target.closest('[data-key]'), c = $('[data-cnt]', box), L = lim(box.dataset.key.split('|')[0]), len = e.target.value.trim().length;
    c.textContent = `${len} / ${L.max}`; c.classList.toggle('bad', len > 0 && len < L.min);
  });
  $('[data-q]', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); refresh(); }, 300));
  await refresh();
  return { refresh };
}

// Hazır cevaplar (her satır bir şablon)
function templates(done) {
  const cur = ((state.settings && state.settings.answer_templates) || []).join('\n');
  const s = sheet({
    title: 'Hazır cevaplar', size: 'narrow',
    body: html`<div class="stack"><p class="muted small" style="margin:0">Her satır bir hazır cevaptır; soru kartında tek tıkla eklenir.</p><textarea class="input" style="min-height:220px" data-t>${cur}</textarea></div>`,
    foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>Kaydet</button>`,
  });
  $('[data-save]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
    const list = $('[data-t]', s.el).value.split('\n').map((x) => x.trim()).filter(Boolean);
    const r = await api('settings', { method: 'PUT', body: { answer_templates: list } });
    state.settings = r; toast('Kaydedildi'); s.close(); done();
  });
}
