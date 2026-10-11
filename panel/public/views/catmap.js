// Kategori eşleştirme: panel kategorileri × bağlı kanallar. Tümünü otomatik eşleştir (öneri), kesinleri onayla, hücreye dokunup
// değiştir; pazaryerinde zorunlu özellik eksiği hücrede görünür ve kategori için varsayılan değer orada girilir.
import { api, html, render, $, $$, ch, chLogo, toast, busy, debounce, sheet, isMobile, isAdmin, state, n } from '../core.js';

export async function catmapView(el) {
  let mx = null, onlyOpen = false, q = '';
  const opened = new Set();
  render(el, html`<div class="stack"><div class="card stack" data-top></div><div class="card flush" data-box><div class="empty"><i class="ico ico-sync spin"></i></div></div></div>`);
  const short = (s, k = 28) => (s && s.length > k ? s.slice(0, k - 1) + '…' : s || '');
  const cellOf = (local, c) => (mx.cells[local] || {})[c] || { state: 'todo' };
  function cellView(local, cid, mob = false) {
    const x = cellOf(local, cid);
    const miss = x.missing && x.missing.length;
    const inner = x.state === 'mapped' ? html`<span class="nm" title="${x.name}"><i class="ico ico-check" style="color:var(--good)"></i> ${short(x.name)}</span>${miss ? html`<span class="pill amber" title="${x.missing.join(', ')}">${x.missing.length} zorunlu özellik eksik</span>` : ''}`
      : x.state === 'suggested' ? html`<span class="nm" title="${x.path ? x.path + ' › ' : ''}${x.name}">${short(x.name)}</span><span class="pill ${x.sure ? 'good' : 'amber'}">${x.sure ? 'kesin' : 'öneri'}</span>`
        : html`<span class="nm muted">${x.state === 'none' ? 'Öneri yok · seç' : '—'}</span>`;
    return html`<button type="button" class="cm-cell" data-act="cell" data-l="${local}" data-c="${cid}">${mob ? html`<span class="row" style="gap:6px">${chLogo(cid, true)}<b>${ch(cid).name}</b></span><span style="display:flex;flex-direction:column;align-items:flex-end;gap:2px">${inner}</span>` : inner}</button>`;
  }
  const isOpen = (local) => mx.channels.some((c) => cellOf(local, c.id).state !== 'mapped');
  const shown = () => mx.locals.filter((l) => (!onlyOpen || isOpen(l.local)) && (!q || l.local.toLocaleLowerCase('tr').includes(q)));
  function drawTop() {
    const sure = mx.locals.reduce((a, l) => a + mx.channels.filter((c) => { const x = cellOf(l.local, c.id); return x.state === 'suggested' && x.sure; }).length, 0);
    render($('[data-top]', el), html`
      <div class="cm-sum"><b>${n(mx.locals.length)} kategori</b>${mx.summary.map((s) => html`<span class="row" style="gap:4px">${chLogo(s.id, true)}${ch(s.id).name} <b style="color:${s.pct >= 90 ? 'var(--good)' : s.pct >= 50 ? 'var(--amber)' : 'var(--bad)'}">%${s.pct}</b></span>`)}</div>
      <div class="row wrap" style="gap:8px">
        ${isAdmin() ? html`<button class="btn primary" data-act="auto"><i class="ico ico-bolt"></i>Tümünü otomatik eşleştir</button>
        <button class="btn" data-act="sure" ${sure ? '' : 'disabled'}><i class="ico ico-check"></i>Kesinleri onayla${sure ? ` (${sure})` : ''}</button>` : ''}
        <label class="check"><input type="checkbox" data-only ${onlyOpen ? 'checked' : ''}> Yalnız eşleşmeyenler</label>
        <span class="spacer"></span>
        <input class="input" style="max-width:220px" type="search" placeholder="Kategori ara" data-q value="${q}">
      </div>
      <div class="small muted" data-prog>${mx.todo ? `${mx.todo} kategori × kanal için henüz öneri yok.` : 'Öneriyi onaylamak ya da değiştirmek için hücreye dokunun.'}</div>
      ${isAdmin() ? html`<label class="check small"><input type="checkbox" data-autosure ${mx.autoSure ? 'checked' : ''}> Kesin eşleşmeleri otomatik onayla <span class="muted tiny">(her gün, yeni kategoriler için)</span></label>` : ''}`);
  }
  function drawBox() {
    const list = shown(), box = $('[data-box]', el);
    if (!mx.channels.length) return render(box, html`<div class="empty-state"><b>Kategori ağacı olan bağlı kanal yok</b><span>Pazaryeri ya da site bağlayın.</span><a class="btn" href="#/entegrasyonlar">Entegrasyonlar</a></div>`);
    if (!list.length) return render(box, html`<div class="empty-state"><b>${mx.locals.length ? 'Hepsi eşleşti' : 'Kategorili ürün yok'}</b><span>${mx.locals.length ? '' : 'Ürünlere kategori girin (ör. Bahçe › Gübre).'}</span></div>`);
    if (isMobile()) {
      return render(box, html`<div class="stack" style="padding:10px;gap:8px">${list.map((l) => { const ok = mx.channels.filter((c) => cellOf(l.local, c.id).state === 'mapped').length, on = opened.has(l.local);
        return html`<div class="cm-card"><button type="button" class="plain row" style="justify-content:space-between;width:100%;gap:8px" data-act="tog" data-l="${l.local}"><span style="text-align:left;min-width:0"><b class="ellipsis">${l.local}</b><div class="tiny muted">${l.n} ürün</div></span><span class="pill ${ok === mx.channels.length ? 'good' : 'amber'}">${ok}/${mx.channels.length}</span></button>
          ${on ? mx.channels.map((c) => cellView(l.local, c.id, true)) : ''}</div>`; })}</div>`);
    }
    render(box, html`<div class="table-wrap"><table class="t cm-t"><thead><tr><th>Panel kategorisi</th>${mx.channels.map((c) => html`<th><span class="ch-name">${chLogo(c.id, true)}${c.name}</span></th>`)}</tr></thead><tbody>
      ${list.map((l) => html`<tr><td><b>${l.local}</b><div class="tiny muted">${l.n} ürün</div></td>${mx.channels.map((c) => html`<td>${cellView(l.local, c.id)}</td>`)}</tr>`)}
    </tbody></table></div>`);
  }
  async function load() { mx = await api('catalog/matrix', { fresh: true }); drawTop(); drawBox(); }
  // Hücre: öneriyi onayla / reddet, kategori ara ve seç; eşleşmiş pazaryeri hücresinde zorunlu özellik varsayılanları
  function cellSheet(local, cid) {
    const c = mx.channels.find((x) => x.id === cid), x = cellOf(local, cid);
    const s = sheet({ title: `${short(local, 40)} → ${c.name}`, size: 'narrow' });
    let attrs = null, vals = {};
    const save = async (id, name) => { await api('catalog/cell', { method: 'POST', body: { local, channel: cid, remote_id: id, remote_name: name } }); toast('Eşleşti'); s.close(); await load(); };
    function draw() {
      s.setBody(html`<div class="stack">
        ${x.state === 'mapped' ? html`<div><span class="muted small">Eşleşen</span><div><i class="ico ico-check" style="color:var(--good)"></i> <b>${x.name}</b></div></div>`
          : x.state === 'suggested' ? html`<div class="notice"><div><span class="pill ${x.sure ? 'good' : 'amber'}">${x.sure ? 'kesin' : 'öneri'}</span> <b>${x.name}</b><div class="tiny muted">${x.path || ''}</div>
            <div class="row" style="gap:6px;margin-top:6px"><button class="btn sm primary" data-x="ok">Onayla</button><button class="btn sm ghost" data-x="rej">Uygun değil</button></div></div></div>` : ''}
        <label class="field"><span>${x.state === 'mapped' ? 'Değiştir' : 'Kategori ara'}</span><input class="input" data-cq placeholder="ör. elbise, kılıf"><div data-res class="stack" style="gap:4px;margin-top:4px"></div></label>
        ${x.state === 'mapped' && c.kind === 'market' ? html`<div data-attrs><div class="muted small"><i class="ico ico-sync spin"></i> Zorunlu özellikler…</div></div>` : ''}
        ${x.state === 'mapped' ? html`<button class="btn sm ghost danger" data-x="unmap" style="align-self:flex-start">Eşleşmeyi kaldır</button>` : ''}
      </div>`);
      const cq = $('[data-cq]', s.body);
      cq.addEventListener('input', debounce(async () => {
        const v = cq.value.trim(); if (v.length < 2) return;
        try {
          const r = await api(`${c.kind === 'market' ? 'catalog/remote-categories' : 'catalog/store-categories'}?channel=${cid}&q=${encodeURIComponent(v)}`);
          render($('[data-res]', s.body), html`${r.items.slice(0, 15).map((k) => html`<button class="cand" style="text-align:left;cursor:pointer" data-pick="${k.id}" data-name="${k.name}"><span><b>${k.name}</b><div class="tiny muted">${k.path || ''}</div></span></button>`)}${!r.items.length ? html`<div class="muted small">Bulunamadı</div>` : ''}`);
        } catch (e) { toast(e.message, true); }
      }, 350));
      if (x.state === 'mapped' && c.kind === 'market') loadAttrs();
    }
    async function loadAttrs() {
      try {
        const [a, st] = await Promise.all([api(`catalog/attributes?channel=${cid}&category=${encodeURIComponent(x.remote_id)}`), api('catalog/state', { fresh: true })]);
        const map = (st.maps || []).find((m) => m.local === local && m.channel === cid) || { attrs: {} };
        attrs = { list: a.attributes.filter((k) => k.mandatory && k.kind !== 'variant' && !/g[öo]rsel|resim|foto|image/i.test(k.name)), cur: map.attrs || {} };
        await Promise.all(attrs.list.filter((k) => /enum|list|select/i.test(k.type || '') || !k.custom).map(async (k) => { vals[k.id] = (await api(`catalog/values?channel=${cid}&category=${encodeURIComponent(x.remote_id)}&attribute=${encodeURIComponent(k.id)}`).catch(() => ({ values: [] }))).values; }));
        const box = $('[data-attrs]', s.body);
        if (!box) return;
        render(box, attrs.list.length ? html`<div class="stack" style="gap:6px"><b class="small">Zorunlu özellikler (bu kategorideki tüm ürünler)</b>${attrs.list.map((k) => { const v = attrs.cur[k.id] || {}; const l = vals[k.id] || [];
          return html`<label class="field"><span>${k.name}${(v.value || v.id) ? '' : html` <span class="pill amber">eksik</span>`}</span>${l.length ? html`<select class="input" data-a="${k.id}"><option value="">Seçin</option>${l.slice(0, 400).map((o) => html`<option value="${o.id}" ${String(v.id) === String(o.id) ? 'selected' : ''}>${o.value}</option>`)}</select>` : html`<input class="input" data-a="${k.id}" value="${v.value || ''}">`}</label>`; })}
          <button class="btn sm primary" data-x="attrs" style="align-self:flex-start">Kaydet</button></div>` : html`<div class="small muted">Zorunlu özellikler tamam.</div>`);
      } catch (e) { const box = $('[data-attrs]', s.body); if (box) render(box, html`<div class="notice bad small">${e.message}</div>`); }
    }
    s.el.addEventListener('click', (e) => {
      const p = e.target.closest('[data-pick]');
      if (p) return busy(p, () => save(p.dataset.pick, p.dataset.name));
      const b = e.target.closest('[data-x]'); if (!b) return;
      const k = b.dataset.x;
      if (k === 'ok') busy(b, () => save(x.remote_id, x.name));
      if (k === 'rej') busy(b, async () => { await api('catalog/cell', { method: 'POST', body: { local, channel: cid, reject: true } }); toast('Öneri kaldırıldı'); s.close(); await load(); });
      if (k === 'unmap') busy(b, async () => { await api('catalog/unmap', { method: 'POST', body: { local, channel: cid } }); toast('Kaldırıldı'); s.close(); await load(); });
      if (k === 'attrs') busy(b, async () => {
        const out = { ...attrs.cur };
        for (const f of $$('[data-a]', s.body)) {
          const id = f.dataset.a;
          if (f.tagName === 'SELECT') { if (f.value) out[id] = { id: f.value, value: f.selectedOptions[0].textContent }; else delete out[id]; }
          else if (f.value.trim()) out[id] = { value: f.value.trim() }; else delete out[id];
        }
        await api('catalog/map', { method: 'POST', body: { local, channel: cid, remote_id: x.remote_id, remote_name: x.name, attrs: out } });
        toast('Kaydedildi'); s.close(); await load();
      });
    });
    draw();
  }
  // Toplu işler parça parça: sunucu her çağrıda bir kısmını yapar, kalan bitene kadar tekrar çağrılır (sayfa kapanırsa kaldığı yerden)
  async function loop(btn, path, body, label) {
    await busy(btn, async () => {
      let total = 0, r, since = null;
      for (let i = 0; i < 200; i++) {
        r = await api(path, { method: 'POST', body: { ...body, ...(since ? { since } : {}) } });
        since = r.since || since;
        total += r.processed ?? r.approved ?? 0;
        const prog = $('[data-prog]', el);
        if (prog) prog.textContent = `${label}: ${total}${r.remaining ? ` · kalan ${r.remaining}` : ''}`;
        if (!r.remaining) break;
      }
      if (r.errors && r.errors.length) toast(r.errors.join(' · '), true);
      await load();
      toast(path === 'catalog/approve-sure' ? `${total} eşleşme onaylandı` : `${total} öneri hazırlandı`);
    });
  }
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]'); if (!t || !el.contains(t)) return;
    const a = t.dataset.act;
    if (a === 'cell') cellSheet(t.dataset.l, t.dataset.c);
    if (a === 'tog') { opened.has(t.dataset.l) ? opened.delete(t.dataset.l) : opened.add(t.dataset.l); drawBox(); }
    if (a === 'auto') loop(t, 'catalog/automap-all', {}, 'Öneri');
    if (a === 'sure') loop(t, 'catalog/approve-sure', {}, 'Onaylanan');
  });
  el.addEventListener('change', async (e) => {
    if (e.target.matches('[data-only]')) { onlyOpen = e.target.checked; drawBox(); }
    if (e.target.matches('[data-autosure]')) {
      try { state.settings = await api('settings', { method: 'PUT', body: { auto_approve_sure: e.target.checked } }); toast(e.target.checked ? 'Açıldı' : 'Kapatıldı'); }
      catch (err) { e.target.checked = !e.target.checked; toast(err.message, true); }
    }
  });
  el.addEventListener('input', debounce((e) => { if (e.target.matches('[data-q]')) { q = e.target.value.trim().toLocaleLowerCase('tr'); drawBox(); } }, 250));
  await load().catch((e) => render($('[data-box]', el), html`<div class="notice bad">${e.message}</div>`));
}
