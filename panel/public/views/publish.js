// Kanallarda yayınla paneli: ürün formunda (tek ürün + varyantları) ve ürün listesinde toplu seçimde aynı panel.
// Her bağlı kanal bir satır: seçim kutusu, durum (Hazır / Eksik / Gönderildi / Yayında / Reddedildi), eksikleri orada tamamlama
// (kategori onayı / değiştirme, zorunlu özellikler, marka, kanal ayarı). Tek düğme: Yayınla.
import { api, html, render, $, $$, ch, chLogo, toast, busy, debounce, sheet, n } from '../core.js';

const enumAttr = (a) => (a.values || []).length > 0;
const LABEL = { ready: 'Hazır', missing: 'Eksik', sent: 'Gönderildi', live: 'Yayında', rejected: 'Reddedildi', error: 'Hata', off: 'Kapalı' };
const CLS = { ready: 'good', missing: 'amber', sent: 'info', live: 'good', rejected: 'bad', error: 'bad', off: '' };

export function publishSheet(ids, pre) {
  const s = sheet({ title: 'Kanallarda yayınla', size: 'wide' });
  mountPublish(s.body, { ids, pre });
  return s;
}

// box: panelin çizileceği öğe · ids: ürünler (varyantlar sunucuda eklenir) · pre: önceden seçili kanallar
// beforePublish(): false dönerse gönderim yapılmaz (ör. form kaydedilmemiş)
export function mountPublish(box, { ids, pre = null, beforePublish = null } = {}) {
  let data = null, draft = { approve: {}, attrs: {}, pattrs: {}, brands: {}, opts: {} }, checked = null, timer = null;
  const open = new Set(), searchFor = new Map(), showAll = new Set();
  const many = () => data && data.products.length > 1;
  const pname = (id) => { const p = data.products.find((x) => x.id === id); return p ? (p.variant_name && data.products.length > 1 ? p.variant_name : p.name) : '#' + id; };

  async function load(path = `catalog/preflight?ids=${ids.join(',')}`, body) {
    data = body ? await api(path, { method: 'POST', body }) : await api(path, { fresh: true });
    // "Yalnız seçtiğim ürünler" kapsamındaki kanal: ürünlerden biri o kanal için seçili değilse kendiliğinden işaretlenmez
    if (!checked) checked = new Set(data.channels.filter((c) => (pre ? pre.includes(c.id) : c.scope !== 'selected' || (c.picked || []).length > 0) && !c.disabled && c.items.some((x) => ['ready', 'missing'].includes(x.state))).map((c) => c.id));
    for (const c of data.channels) if (c.items.some((x) => x.state === 'missing' || x.state === 'rejected' || x.state === 'error') && c.kind === 'market' && checked.has(c.id) && !open.size) open.add(c.id);
    draw();
    poll();
  }
  const recheck = debounce(() => load('catalog/preflight', { ids, ...draft }).catch((e) => toast(e.message, true)), 400);
  const dirty = () => recheck();

  // Kanal satırının özeti
  function sum(c) {
    const k = c.counts || {}, items = c.items;
    if (c.disabled) return { st: 'off', text: c.disabled };
    const miss = [...new Set(items.flatMap((x) => (['missing', 'rejected', 'error'].includes(x.state) ? x.missing : [])))];
    const why = items.find((x) => x.error);
    let st = 'ready';
    if (items.every((x) => x.state === 'live')) st = 'live';
    else if (k.sent) st = 'sent';
    else if (k.rejected) st = 'rejected';
    else if (k.error) st = 'error';
    else if (!k.ready && k.missing) st = 'missing';
    const text = st === 'missing' ? miss.slice(0, 3).join(', ') + (miss.length > 3 ? '…' : '')
      : st === 'rejected' || st === 'error' ? (why && why.error) || miss.join(', ') : '';
    const parts = many() && Object.values(k).filter(Boolean).length > 1 ? Object.entries(k).filter(([, v]) => v).map(([s2, v]) => `${v} ${LABEL[s2].toLocaleLowerCase('tr')}`).join(' · ') : '';
    return { st, text, parts };
  }
  const badge = (st, text) => html`<span class="pill ${CLS[st]} pub-badge" title="${text || ''}">${st === 'sent' ? html`<i class="ico ico-sync spin"></i> ` : ''}${LABEL[st]}${text ? `: ${text}` : ''}</span>`;

  function catBlock(c, cat) {
    const d = ((draft.approve[c.id] || {}).cats || {})[cat.key];
    const cur = d ? { name: d.name, state: 'mapped' } : cat;
    const q = searchFor.get(c.id + '|' + cat.key);
    const label = cat.local ? cat.local : 'Bu ürün';
    return html`<div class="pub-fix" data-cat="${cat.key}">
      <div class="small muted">${many() ? html`<b>${label}</b> · ` : ''}Kategori</div>
      ${cur.state === 'mapped' ? html`<div class="row wrap" style="gap:6px"><span><i class="ico ico-check" style="color:var(--good)"></i> ${cur.name}</span>${d ? html`<span class="pill info">seçildi</span>` : ''}<button type="button" class="btn sm ghost" data-p="catsearch">Değiştir</button></div>`
        : cur.state === 'suggested' ? html`<div class="row wrap" style="gap:6px"><span><b>${cur.name}</b>${cur.path ? html` <span class="tiny muted">${cur.path}</span>` : ''}</span><span class="pill ${cur.sure ? 'good' : 'amber'}">${cur.sure ? 'kesin' : 'öneri'}</span>
            <button type="button" class="btn sm primary" data-p="catok" data-id="${cur.remote_id}" data-name="${cur.name}">Onayla</button><button type="button" class="btn sm ghost" data-p="catsearch">Değiştir</button></div>
          ${(cur.alts || []).length ? html`<div class="row wrap" style="gap:4px">${cur.alts.map((x) => html`<button type="button" class="chip-btn" data-p="catok" data-id="${x.id}" data-name="${x.name}" title="${x.path}">${x.name}</button>`)}</div>` : ''}`
          : html`<div class="row wrap" style="gap:6px"><span class="pill amber">Eşleşmedi</span><button type="button" class="btn sm" data-p="catsearch">Kategori seç</button></div>`}
      ${cur.state !== 'mapped' ? html`<a class="link tiny" href="#/kategori-eslestirme">Tüm kategorileri eşleştir</a>` : ''}
      ${q ? html`<div class="stack" style="gap:4px"><input class="input" data-p="catq" placeholder="Kategori ara" value="${q.q || ''}"><div data-catres>${(q.items || []).map((x) => html`<button type="button" class="cand" style="text-align:left;cursor:pointer" data-p="catok" data-id="${x.id}" data-name="${x.name}"><span><b>${x.name}</b><div class="tiny muted">${x.path || ''}</div></span></button>`)}</div></div>` : ''}
    </div>`;
  }
  function field(c, cat, a, pid, v) {
    const val = v || {};
    const name = `${c.id}|${a.id}|${pid || ''}`;
    if (enumAttr(a) && !a.more) return html`<select class="input" data-attr="${name}"><option value="">Seçin</option>${a.values.map((x) => html`<option value="${x.id}" ${String(val.id) === String(x.id) ? 'selected' : ''}>${x.value}</option>`)}</select>`;
    const list = `dl-${c.id}-${a.id}`;
    return html`<input class="input" data-attr="${name}" value="${val.value || ''}" placeholder="${a.name}" ${enumAttr(a) ? html`list="${list}"` : ''}>${enumAttr(a) ? html`<datalist id="${list}">${a.values.map((x) => html`<option value="${x.value}">`)}</datalist>` : ''}`;
  }
  function attrBlock(c, cat) {
    const items = c.items.filter((x) => x.cat === cat.key);
    if (!cat.attrs || !cat.attrs.length || !items.length) return '';
    const bad = (it, a) => { const v = it.vals[a.id]; return !v || v.bad || !(v.id || String(v.value || '').trim()); };
    const all = showAll.has(c.id + cat.key);
    const list = cat.attrs.filter((a) => all || items.some((it) => bad(it, a)));
    const hidden = cat.attrs.length - list.length;
    return html`<div class="pub-fix">
      ${list.length ? html`<div class="small muted">Zorunlu bilgiler</div><div class="form-grid">${list.map((a) => (a.kind === 'variant' && items.length > 1 && items.length <= 12
        ? items.map((it) => html`<label class="field"><span>${a.name} · ${pname(it.id)}</span>${field(c, cat, a, it.id, it.vals[a.id])}</label>`)
        : html`<label class="field"><span>${a.name}${a.mandatory ? ' *' : ''}</span>${field(c, cat, a, a.kind === 'variant' && items.length === 1 ? items[0].id : null, items[0].vals[a.id])}</label>`))}</div>` : ''}
      ${hidden ? html`<button type="button" class="link tiny" data-p="allattrs" data-k="${cat.key}">${all ? 'Yalnız eksikleri göster' : `Tüm özellikler (${cat.attrs.length})`}</button>` : ''}
    </div>`;
  }
  function brandBlock(c) {
    const miss = c.items.filter((x) => x.brand && x.brand.state === 'missing');
    if (!miss.length) return '';
    const brands = [...new Set(miss.map((x) => (data.products.find((p) => p.id === x.id) || {}).brand || ''))];
    return brands.map((b) => {
      const d = ((draft.brands[c.id] || {})[b]);
      const q = searchFor.get(c.id + '|brand|' + b) || { q: b, items: (miss.find((x) => ((data.products.find((p) => p.id === x.id) || {}).brand || '') === b).brand.options || []) };
      return html`<div class="pub-fix" data-brand="${b}">
        <div class="small muted">Marka${b ? html` · “${b}” ${ch(c.id).name}'da bulunamadı` : ''}</div>
        ${d ? html`<div class="row" style="gap:6px"><i class="ico ico-check" style="color:var(--good)"></i>${d.name}</div>` : ''}
        ${c.brandSearch ? html`<input class="input" data-p="brandq" placeholder="Marka ara" value="${q.q || ''}"><div class="row wrap" style="gap:4px">${(q.items || []).map((x) => html`<button type="button" class="chip-btn ${d && String(d.remote_id) === String(x.id) ? 'on' : ''}" data-p="brandok" data-id="${x.id}" data-name="${x.name}">${x.name}</button>`)}</div>`
          : html`<div class="tiny muted">Ürün formunda marka girin.</div>`}
      </div>`;
    });
  }
  function optBlock(c) {
    const need = (c.options || []).filter((o) => o.need);
    const mk = c.markup == null ? '' : html`<div class="pub-fix"><label class="field" style="max-width:320px"><span>Fiyat farkı (%)</span><input class="input" data-opt="${c.id}|markup" value="${((draft.opts[c.id] || {}).markup) ?? (c.markup || '')}" placeholder="0" inputmode="decimal"><small>Site fiyatının üstüne eklenir (ör. 10 → 1.000 ₺ ürün ${c.name}’da 1.100 ₺). Yalnız ilk gönderimde uygulanır; kanal için bir kez kaydedilir.</small></label></div>`;
    if (!need.length) return mk;
    return html`${mk}<div class="pub-fix"><div class="small muted">Kanal ayarı (bir kez sorulur)</div><div class="form-grid">${need.map((o) => html`<label class="field"><span>${o.label}</span><input class="input" data-opt="${c.id}|${o.k}" value="${((draft.opts[c.id] || {})[o.k]) ?? o.value}" inputmode="${/day|warranty|Id$/i.test(o.k) ? 'numeric' : 'text'}"></label>`)}</div></div>`;
  }
  function body(c) {
    if (c.kind !== 'market') {
      const miss = [...new Set(c.items.flatMap((x) => x.missing))];
      return miss.length ? html`<div class="pub-fix small">Üründe eksik: ${miss.join(', ')}</div>` : '';
    }
    const other = [...new Set(c.items.filter((x) => x.state !== 'live' && x.state !== 'sent').flatMap((x) => x.missing).filter((m) => !/^(Kategori|Marka)/.test(m) && !(c.options || []).some((o) => o.label === m) && !c.cats.some((k) => (k.attrs || []).some((a) => m.startsWith(a.name)))))];
    const list0 = many() ? c.items.filter((x) => x.missing.length && x.state !== 'live') : [];
    // Ürün ürün eksikler: yalnız ürünlerin eksikleri farklıysa
    const list = new Set(list0.map((x) => x.missing.join('|'))).size > 1 ? list0.slice(0, 8) : [];
    return html`${c.cats.map((k) => html`${catBlock(c, k)}${attrBlock(c, k)}`)}${brandBlock(c)}${optBlock(c)}
      ${other.length ? html`<div class="pub-fix small"><span class="muted">Üründe eksik:</span> ${other.join(', ')} <span class="tiny muted">(ürün bilgilerinden düzeltin)</span></div>` : ''}
      ${list.length > 1 ? html`<div class="pub-fix tiny"><div class="muted">Eksik olanlar</div>${list.map((x) => html`<div class="ellipsis">${pname(x.id)}: ${x.missing.join(', ')}</div>`)}</div>` : ''}`;
  }
  function draw() {
    if (!box.isConnected && box !== document.body) { /* panel kapandı */ }
    if (!data.channels.length) return render(box, html`<div class="muted small">Ürün açılabilecek bağlı kanal yok. <a class="link" href="#/entegrasyonlar">Entegrasyonlar</a></div>`);
    const sendable = (c) => !c.disabled && c.items.some((x) => x.state === 'ready');
    const go = data.channels.filter((c) => checked.has(c.id) && sendable(c));
    // Yazarken yeniden çizim: odaktaki alan ve imleç korunur
    const f = document.activeElement && box.contains(document.activeElement) ? document.activeElement : null;
    const fk = f && (f.dataset.opt ? `[data-opt="${f.dataset.opt}"]` : f.dataset.attr ? `[data-attr="${f.dataset.attr}"]` : f.dataset.p && f.closest('[data-ch]') ? `[data-ch="${f.closest('[data-ch]').dataset.ch}"] ${f.closest('[data-cat]') ? `[data-cat="${CSS.escape(f.closest('[data-cat]').dataset.cat)}"] ` : f.closest('[data-brand]') ? `[data-brand="${CSS.escape(f.closest('[data-brand]').dataset.brand)}"] ` : ''}[data-p="${f.dataset.p}"]` : null);
    const pos = f && typeof f.selectionStart === 'number' ? f.selectionStart : null;
    setTimeout(() => { if (!fk) return; const g = $(fk, box); if (g && g !== document.activeElement) { g.focus(); if (pos != null && g.setSelectionRange) try { g.setSelectionRange(pos, pos); } catch { /* seçim yok */ } } }, 0);
    render(box, html`<div class="pub">
      ${many() ? html`<div class="small muted">${n(data.products.length)} ürün (varyantlar dahil)</div>` : ''}
      ${data.channels.map((c) => {
        const s = sum(c), done = c.items.every((x) => ['live', 'sent'].includes(x.state)), isOpen = open.has(c.id);
        const fixable = c.kind === 'market' && c.items.some((x) => x.missing.length && x.state !== 'live');
        const retry = c.items.some((x) => ['rejected', 'error'].includes(x.state));
        return html`<div class="pub-row ${isOpen ? 'open' : ''}" data-ch="${c.id}">
          <div class="pub-head">
            <label class="check" style="min-width:0;flex:1"><input type="checkbox" data-pick="${c.id}" ${checked.has(c.id) && !done ? 'checked' : ''} ${done || c.disabled ? 'disabled' : ''}>${chLogo(c.id, true)}<b class="ellipsis">${c.name}</b></label>
            ${badge(s.st, s.text)}
            ${retry ? html`<button type="button" class="btn sm" data-p="retry">Tekrar dene</button>` : ''}
            ${fixable || (c.kind === 'market' && c.cats.length) ? html`<button type="button" class="icon-btn sm" data-p="toggle" aria-label="Ayrıntı"><i class="ico ico-down"></i></button>` : ''}
          </div>
          ${s.parts ? html`<div class="tiny muted">${s.parts}</div>` : ''}
          ${c.scope === 'selected' && !done ? html`<div class="tiny muted" title="Ürün yükle → ${c.name} → Gönderilecek ürünler">Bu kanala yalnız seçtiğiniz ürünler gider${data.products.length > 1 ? ` · ${(c.picked || []).length}/${data.products.length} seçili` : (c.picked || []).length ? ' · bu ürün seçili' : ' · bu ürün seçili değil'}. Yayınlarsanız seçili olur.</div>` : ''}
          ${done ? html`<div class="tiny muted">${s.st === 'live' ? 'Kanalda açık' : 'Kanal sonucu bekleniyor'}</div>` : checked.has(c.id) && !sendable(c) && !c.disabled && c.items.some((x) => x.state === 'missing') ? html`<div class="tiny" style="color:var(--amber)">Eksikleri tamamlayınca gönderilir</div>` : ''}
          ${isOpen ? html`<div class="pub-body">${body(c)}</div>` : ''}
        </div>`;
      })}
      <div class="row wrap" style="gap:8px;margin-top:4px"><button type="button" class="btn primary" data-p="publish" ${go.length ? '' : 'disabled'}><i class="ico ico-send"></i>Yayınla${go.length ? ` (${go.length})` : ''}</button>
        <span class="tiny muted">${go.length ? 'Seçili ve hazır kanallara gönderilir.' : 'Hazır kanal yok.'}</span></div>
    </div>`);
  }
  // Gönderilmiş ürünlerin sonucu: birkaç saniyede bir sorulur (panel açık kaldıkça)
  function poll() {
    clearTimeout(timer);
    if (!data || !data.channels.some((c) => c.items.some((x) => x.state === 'sent'))) return;
    timer = setTimeout(async () => {
      if (!box.isConnected) return;
      try {
        const r = await api(`catalog/publish/status?ids=${data.products.map((p) => p.id).join(',')}`, { fresh: true });
        let changed = false;
        for (const s of r.items) {
          const c = data.channels.find((x) => x.id === s.channel), it = c && c.items.find((x) => x.id === s.id);
          if (it && it.state !== s.state) { it.state = s.state; it.error = s.error; changed = true; }
        }
        if (changed) { for (const c of data.channels) c.counts = c.items.reduce((o, x) => { o[x.state] = (o[x.state] || 0) + 1; return o; }, {}); draw(); }
      } catch { /* sonraki denemede */ }
      poll();
    }, 6000);
  }
  async function send(btn, only, retry) {
    if (beforePublish && (await beforePublish([...checked])) === false) return;
    await busy(btn, async () => {
      const chans = only || [...checked];
      const r = await api('catalog/publish', { method: 'POST', body: { ids, channels: chans, ...draft, ...(retry ? { retry } : {}) } });
      data = r; draft = { approve: {}, attrs: {}, pattrs: {}, brands: {}, opts: {} };
      const ok = Object.entries(r.results).filter(([, x]) => x.sent || x.live).map(([k, x]) => `${ch(k).name}: ${x.live ? `${x.live} ürün açıldı` : `${x.sent} ürün gönderildi`}`);
      const bad = Object.entries(r.results).filter(([, x]) => x.error).map(([k, x]) => `${ch(k).name}: ${x.error}`);
      toast([...ok, ...bad].join(' · ') || 'Gönderilecek hazır ürün yok', !ok.length);
      draw(); poll();
    });
  }
  const chOf = (t) => { const r = t.closest('[data-ch]'); return r && data.channels.find((c) => c.id === r.dataset.ch); };
  box.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-p]');
    if (!t || !box.contains(t)) return;
    const c = chOf(t), act = t.dataset.p;
    if (act === 'publish') return send(t);
    if (!c) return;
    e.preventDefault();
    if (act === 'toggle') { open.has(c.id) ? open.delete(c.id) : open.add(c.id); draw(); }
    if (act === 'retry') send(t, [c.id], [c.id]);
    if (act === 'allattrs') { const k = c.id + t.dataset.k; showAll.has(k) ? showAll.delete(k) : showAll.add(k); draw(); }
    const ck = t.closest('[data-cat]');
    if (act === 'catsearch') { searchFor.set(c.id + '|' + ck.dataset.cat, { q: '', items: [] }); draw(); const i = $(`[data-ch="${c.id}"] [data-cat="${CSS.escape(ck.dataset.cat)}"] [data-p=catq]`, box); if (i) i.focus(); }
    if (act === 'catok') {
      const a = draft.approve[c.id] = draft.approve[c.id] || { cats: {} };
      a.cats[ck.dataset.cat] = { id: t.dataset.id, name: t.dataset.name };
      searchFor.delete(c.id + '|' + ck.dataset.cat);
      draw(); dirty();
    }
    if (act === 'brandok') {
      const b = t.closest('[data-brand]').dataset.brand;
      (draft.brands[c.id] = draft.brands[c.id] || {})[b] = { remote_id: t.dataset.id, name: t.dataset.name };
      draw(); dirty();
    }
  });
  const searchCat = debounce(async (c, key, q) => {
    try {
      const r = q.length < 2 ? { items: [] } : await api(`catalog/remote-categories?channel=${c.id}&q=${encodeURIComponent(q)}`);
      searchFor.set(c.id + '|' + key, { q, items: r.items.slice(0, 12) });
      const res = $(`[data-ch="${c.id}"] [data-cat="${CSS.escape(key)}"] [data-catres]`, box);
      if (res) render(res, html`${r.items.slice(0, 12).map((x) => html`<button type="button" class="cand" style="text-align:left;cursor:pointer" data-p="catok" data-id="${x.id}" data-name="${x.name}"><span><b>${x.name}</b><div class="tiny muted">${x.path || ''}</div></span></button>`)}${q.length >= 2 && !r.items.length ? html`<div class="tiny muted">Bulunamadı</div>` : ''}`);
    } catch (err) { toast(err.message, true); }
  }, 350);
  const searchBrand = debounce(async (c, b, q, el) => {
    try {
      const it = c.items.find((x) => x.brand && x.brand.state === 'missing');
      const cat = it && c.cats.find((k) => k.key === it.cat);
      const r = q.length < 2 ? { items: [] } : await api(`catalog/brands?channel=${c.id}&q=${encodeURIComponent(q)}${cat && cat.remote_id ? `&category=${encodeURIComponent(cat.remote_id)}` : ''}`);
      searchFor.set(c.id + '|brand|' + b, { q, items: r.items });
      const row = el.nextElementSibling;
      if (row) render(row, html`${r.items.map((x) => html`<button type="button" class="chip-btn" data-p="brandok" data-id="${x.id}" data-name="${x.name}">${x.name}</button>`)}${q.length >= 2 && !r.items.length ? html`<span class="tiny muted">Bulunamadı</span>` : ''}`);
    } catch (err) { toast(err.message, true); }
  }, 350);
  box.addEventListener('input', (e) => {
    const t = e.target, c = chOf(t);
    if (!c) return;
    if (t.dataset.p === 'catq') searchCat(c, t.closest('[data-cat]').dataset.cat, t.value.trim());
    if (t.dataset.p === 'brandq') searchBrand(c, t.closest('[data-brand]').dataset.brand, t.value.trim(), t);
    if (t.dataset.opt) { const [cid, k] = t.dataset.opt.split('|'); (draft.opts[cid] = draft.opts[cid] || {})[k] = t.value.trim(); dirty(); }
    if (t.dataset.attr && t.tagName === 'INPUT') setAttr(t);
  });
  function setAttr(t) {
    const [cid, aid, pid] = t.dataset.attr.split('|');
    const v = t.tagName === 'SELECT' ? (t.value ? { id: t.value, value: t.selectedOptions[0].textContent } : '') : t.value.trim();
    if (pid && many()) (((draft.pattrs[pid] = draft.pattrs[pid] || {})[cid] = draft.pattrs[pid][cid] || {})[aid] = v);
    else if (pid) (((draft.pattrs[pid] = draft.pattrs[pid] || {})[cid] = draft.pattrs[pid][cid] || {})[aid] = v);
    else (draft.attrs[cid] = draft.attrs[cid] || {})[aid] = v;
    dirty();
  }
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.pick) { t.checked ? checked.add(t.dataset.pick) : checked.delete(t.dataset.pick); draw(); return; }
    if (t.dataset.attr && t.tagName === 'SELECT') setAttr(t);
  });
  render(box, html`<div class="muted small"><i class="ico ico-sync spin"></i> Kanallar kontrol ediliyor…</div>`);
  load().catch((e) => render(box, html`<div class="notice bad small">${e.message}</div>`));
  return { reload: () => load(), stop: () => clearTimeout(timer) };
}
