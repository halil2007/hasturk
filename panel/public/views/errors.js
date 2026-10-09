// Müşteri hataları (ana panel → Destek): firmaların panelinde kendiliğinden kaydedilen hatalar. Aynı hata tek satırda toplanır
// (kaç kez, kimde, ilk / son); çözüldü denen hata tekrar ederse yeniden açılır ve bildirim gelir. Yok sayılanlar sessizce sayılır.
import { api, html, render, $, $$, n, ago, dateTime, actions, busy, toast, sheet } from '../core.js';
import { setQuery } from '../app.js';

const SRC = { client: ['Ekran hatası', 'warn'], api: ['İşlem hatası', 'bolt'], server: ['Sunucu hatası', 'x'], sync: ['Arka plan / kanal', 'sync'], perf: ['Yavaş işlem', 'bolt'] };
const ST = { open: ['bad', 'Açık'], resolved: ['good', 'Çözüldü'], ignored: ['', 'Yok sayıldı'] };

export async function errorsView(el, query = {}) {
  const f = { status: 'open', source: '', slug: '', q: '' };
  let d = null;
  const sel = new Set();
  async function load() {
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    d = await api('errors?' + p, { fresh: true });
    draw();
  }
  function draw() {
    const c = d.counts || {};
    render(el, html`<div class="stack">
      <div class="kpis">
        <div class="kpi"><div class="label">Açık hata</div><div class="value num" style="color:${c.open ? 'var(--bad)' : 'var(--good)'}">${n(c.open || 0)}</div><div class="delta flat">farklı hata</div></div>
        <div class="kpi"><div class="label">Son 24 saat</div><div class="value num">${n(d.last24)}</div><div class="delta flat">hata oluştu</div></div>
        <div class="kpi"><div class="label">Hata olan firma</div><div class="value num">${n(d.firms.length)}</div><div class="delta flat">açık hatası olan</div></div>
        <div class="kpi"><div class="label">Çözülen</div><div class="value num">${n(c.resolved || 0)}</div><div class="delta flat">${n(c.ignored || 0)} yok sayıldı</div></div>
      </div>
      <div class="row wrap" style="gap:10px">
        <div class="tabs" style="flex:1;min-width:0">${[['open', 'Açık'], ['resolved', 'Çözülen'], ['ignored', 'Yok sayılan'], ['', 'Tümü']].map(([k, t]) => html`<button class="tab ${f.status === k ? 'on' : ''}" data-act="st" data-k="${k}">${t}${k && c[k] ? html` <span class="n">${n(c[k])}</span>` : ''}</button>`)}</div>
        <select class="input" style="width:auto" data-f="source"><option value="">Tüm türler</option>${Object.entries(SRC).map(([k, [t]]) => html`<option value="${k}" ${f.source === k ? 'selected' : ''}>${t}</option>`)}</select>
        <select class="input" style="width:auto" data-f="slug"><option value="">Tüm firmalar</option>${d.firms.map((x) => html`<option value="${x.slug || '-'}" ${f.slug === (x.slug || '-') ? 'selected' : ''}>${x.firm || 'Ana panel'} (${x.n})</option>`)}</select>
        <div class="search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Hata, firma, işlem" data-q value="${f.q}"></div>
      </div>
      ${sel.size ? html`<div class="card row wrap small" style="gap:10px"><b>${n(sel.size)} seçili</b><button class="btn sm" data-act="bulk" data-k="resolved"><i class="ico ico-check"></i>Çözüldü</button><button class="btn sm ghost" data-act="bulk" data-k="ignored">Yok say</button></div>` : ''}
      ${d.items.length ? html`<div class="card flush"><div class="table-wrap"><table class="t err-t"><thead><tr><th style="width:28px"><input type="checkbox" data-all></th><th>Hata</th><th>Firma</th><th class="r">Kez</th><th>Son</th><th>Durum</th></tr></thead><tbody>
        ${d.items.map((e) => { const s = SRC[e.source] || SRC.client, st = ST[e.status] || ST.open; return html`<tr class="click" data-id="${e.id}">
          <td><input type="checkbox" data-sel ${sel.has(e.id) ? 'checked' : ''}></td>
          <td style="min-width:280px"><div class="row" style="gap:8px;align-items:flex-start"><i class="ico ico-${s[1]} muted" style="margin-top:2px"></i><div style="min-width:0"><div class="err-msg">${e.message}</div>
            <div class="tiny muted">${s[0]}${e.action ? ` · ${e.action}` : ''}${e.page ? ` · sayfa: ${e.page}` : ''}${e.user_name ? ` · ${e.user_name}` : ''}</div></div></div></td>
          <td class="small"><b>${e.firm || 'Ana panel'}</b>${e.slug ? html`<div class="tiny muted">${e.slug}</div>` : ''}</td>
          <td class="r num" style="font-weight:700">${n(e.count)}</td>
          <td class="small" style="white-space:nowrap" title="${dateTime(e.last_at)}">${ago(e.last_at)}<div class="tiny muted">ilk ${ago(e.first_at)}</div></td>
          <td><span class="pill ${st[0]}">${st[1]}</span>${e.reopened ? html`<div class="tiny" style="color:var(--bad)">tekrarladı</div>` : e.auto && e.status === 'resolved' ? html`<div class="tiny muted" title="${e.auto}">kendiliğinden</div>` : ''}</td></tr>`; })}
      </tbody></table></div></div>` : html`<div class="card empty">${f.status === 'open' ? 'Açık hata yok 🎉 Müşteri panellerinde hata oluşunca burada görünür.' : 'Kayıt yok'}</div>`}
      <div class="muted tiny">Müşteri panellerinde oluşan ekran hataları, başarısız işlemler (ör. etiket alınamadı), sunucu hataları ve kanal senkron hataları kendiliğinden kaydedilir. Aynı hata tek satırda toplanır; çözüldü denen hata tekrar ederse yeniden açılır ve bildirim gelir.</div>
    </div>`);
    const q = $('[data-q]', el);
    q.oninput = () => { clearTimeout(q._t); q._t = setTimeout(() => { f.q = q.value.trim(); load(); }, 300); };
    $$('[data-f]', el).forEach((s) => { s.onchange = () => { f[s.dataset.f] = s.value; load(); }; });
    $$('[data-sel]', el).forEach((b) => { b.onchange = () => { const id = Number(b.closest('tr').dataset.id); b.checked ? sel.add(id) : sel.delete(id); draw(); }; });
    const all = $('[data-all]', el);
    if (all) all.onchange = () => { d.items.forEach((e) => (all.checked ? sel.add(e.id) : sel.delete(e.id))); draw(); };
    $$('tr[data-id]', el).forEach((tr) => { tr.onclick = (ev) => { if (!ev.target.closest('input, button, a')) open(Number(tr.dataset.id)); }; });
  }
  async function open(id) {
    setQuery({ t: 'hatalar', e: id });
    const s = sheet({ title: 'Hata ayrıntısı', size: 'drawer', body: html`<div class="empty"><i class="ico ico-sync spin"></i></div>`, onClose: () => setQuery({ t: 'hatalar', e: '' }) });
    // Başka sayfaya geçilince ayrıntı kapanır
    const off = () => s.close();
    window.addEventListener('hashchange', off, { once: true });
    const e = await api('errors/' + id, { fresh: true }).catch((x) => { s.close(); toast(x.message, true); return null; });
    if (!e) return;
    const src = SRC[e.source] || SRC.client, st = ST[e.status] || ST.open, dt = e.detail || {};
    s.setBody(html`<div class="stack">
      <div class="notice ${e.status === 'open' ? 'bad' : ''}"><i class="ico ico-${src[1]}"></i><div style="min-width:0"><b>${src[0]}</b><div style="word-break:break-word">${e.message}</div></div></div>
      <dl class="id-kv"><dt>Firma</dt><dd>${e.firm || 'Ana panel'}${e.slug ? ` (${e.slug})` : ''}</dd><dt>Durum</dt><dd><span class="pill ${st[0]}">${st[1]}</span></dd>
        ${e.auto && e.status === 'resolved' ? html`<dt>Çözülme</dt><dd>Kendiliğinden: ${e.auto}</dd>` : ''}<dt>İşlem</dt><dd>${e.action || '—'}${e.status_code ? ` · HTTP ${e.status_code}` : ''}</dd><dt>Sayfa</dt><dd>${e.page || '—'}</dd><dt>Son kullanıcı</dt><dd>${e.user_name || '—'}</dd>
        <dt>Kaç kez</dt><dd>${n(e.count)}</dd><dt>İlk / son</dt><dd>${dateTime(e.first_at)} / ${dateTime(e.last_at)}</dd>
        ${dt.screen ? html`<dt>Ekran</dt><dd>${dt.screen}${dt.version ? ` · sürüm ${dt.version}` : ''}</dd>` : ''}</dl>
      ${dt.browser ? html`<div class="tiny muted" style="word-break:break-word">${dt.browser}</div>` : ''}
      ${dt.stack ? html`<details><summary class="small" style="cursor:pointer;font-weight:650">Teknik ayrıntı (yığın)</summary><pre class="err-stack">${dt.stack}</pre></details>` : ''}
      ${e.tickets && e.tickets.length ? html`<div><h3>Firmanın ilgili destek talepleri</h3>${e.tickets.map((t) => html`<a class="row" style="gap:8px;padding:6px 0" href="#/destek/${t.id}"><i class="ico ico-chat"></i><span class="ellipsis" style="flex:1">#${t.id} ${t.subject}</span><span class="tiny muted">${ago(t.created_at)}</span></a>`)}</div>` : ''}
    </div>`);
    s.setFoot(html`<span class="spacer"></span>${e.status !== 'ignored' ? html`<button class="btn ghost" data-k="ignored">Yok say</button>` : ''}${e.status !== 'open' ? html`<button class="btn" data-k="open">Yeniden aç</button>` : ''}${e.status !== 'resolved' ? html`<button class="btn primary" data-k="resolved"><i class="ico ico-check"></i>Çözüldü</button>` : ''}`);
    $$('[data-k]', s.foot).forEach((b) => { b.onclick = () => busy(b, async () => { await api(`errors/${id}/status`, { method: 'POST', body: { status: b.dataset.k } }); s.close(); toast({ resolved: 'Çözüldü olarak işaretlendi; tekrar ederse yeniden açılır', ignored: 'Yok sayıldı', open: 'Yeniden açıldı' }[b.dataset.k]); await load(); }); });
  }
  actions(el, {
    st: (b) => { f.status = b.dataset.k; sel.clear(); load(); },
    bulk: (b) => busy(b, async () => { await api('errors/bulk', { method: 'POST', body: { ids: [...sel], status: b.dataset.k } }); sel.clear(); toast('Güncellendi'); await load(); }),
  });
  await load();
  if (query.e) open(Number(query.e));
  return { refresh: load };
}
