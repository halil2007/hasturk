// Ürün yükle: ikas kategorilerini pazaryeri kategorileriyle eşleştir, kanalda olmayan ürünleri seçip gönder, sonucu takip et.
import { api, html, render, $, $$, money, n, dateTime, actions, busy, toast, sheet, debounce, chLogo, thumb, isAdmin, store, state } from '../core.js';

const ST = { sent: ['warn', 'Kanal işliyor'], done: ['good', 'Tamamlandı'], error: ['bad', 'Gönderilemedi'] };
const catName = (l) => l || 'Kategorisiz';

export async function uploadView(el) {
  let st = null, chId = store.get('upload_ch') || '', allUp = false;
  const C = () => st.channels.find((c) => c.id === chId);
  const mapOf = (local) => st.maps.find((m) => m.local === local && m.channel === chId);

  async function load() {
    st = await api('catalog/state');
    if (!st.channels.some((c) => c.id === chId && c.ready)) chId = (st.channels.find((c) => c.ready) || st.channels[0] || {}).id || '';
    draw();
  }
  function draw() {
    const c = C();
    render(el, html`<div class="stack">
      <div class="notice"><i class="ico ico-upload"></i><div style="flex:1"><b>ikas'taki ürünleri pazaryerlerine yükleyin.</b> 1) ikas kategorisini pazaryeri kategorisiyle bir kez eşleştirin (zorunlu özellikler dahil) · 2) Kanalda henüz olmayan ürünleri seçip gönderin · 3) Kanalın onay sonucunu hemen alttaki “Gönderimler” bölümünden takip edin. Onaylanan ürün barkod / SKU ile otomatik eşleşir.
        ${!st.stockSync && c && !c.stockPush ? html`<div class="small" style="margin-top:4px">Stok senkronu kapalı: ürün ilk stokla gönderilir, sonraki stok değişiklikleri bu kanala gitmez (aşağıdan “Stokları gönder”i açabilirsiniz).</div>` : ''}</div></div>
      <div class="ch-tabs">${st.channels.map((x) => html`<button class="ch-tab ${x.id === chId ? 'on' : ''}" data-act="ch" data-id="${x.id}" ${x.ready ? '' : 'disabled'} title="${x.reason}">${chLogo(x.id)}${x.name}${!x.ready ? html`<span class="tiny muted">${x.reason}</span>` : ''}</button>`)}</div>
      ${c && c.test ? html`<div class="notice warn"><i class="ico ico-warn"></i><div><b>${c.name} TEST ortamına (SIT) bağlı.</b> Buradan gönderilen ürünler gerçek ${c.name}'ya gitmez, satışa çıkmaz; yalnız test adımları içindir. Kanaldan gelen ilanlar da test ilanlarıdır (sizin ürünlerinizle eşleşmez). Canlı bilgiler gelince Entegrasyonlar → ${c.name} → <b>Ortam = Canlı</b> seçin.</div></div>` : ''}
      <div class="card flush" id="gonderimler">
        <div class="card-head" style="padding:16px 16px 0"><h2>Gönderimler</h2><span class="muted small">kanalın onay sonucu burada görünür · kendiliğinden sorgulanır (ilk 4 saat 15 dk'da bir, sonra saatte bir, 3 güne kadar)</span><span class="spacer"></span>${st.uploads.length > 5 ? html`<button class="btn sm ghost" data-act="allup">${allUp ? 'Son 5' : `Tümü (${st.uploads.length})`}</button>` : ''}</div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Tarih</th><th>Kanal</th><th class="r">Ürün</th><th>Takip no</th><th>Durum</th><th></th></tr></thead><tbody>
          ${(allUp ? st.uploads : st.uploads.slice(0, 5)).map((u) => { const ok = u.items.filter((x) => x.ok === true).length, bad = u.items.filter((x) => x.ok === false).length, s = ST[u.status] || ['', u.status]; return html`<tr>
            <td class="small">${dateTime(u.created_at)}<div class="tiny muted">${u.user || ''}</div></td><td>${chLogo(u.channel, true)}</td><td class="r num">${u.items.length}</td>
            <td class="small num ellipsis" style="max-width:200px">${u.ref || '—'}</td>
            <td><span class="pill ${s[0]}">${s[1]}</span>${ok || bad ? html` <span class="tiny">${ok ? html`<span style="color:var(--good)">${ok} onay</span>` : ''} ${bad ? html`<span style="color:var(--bad)">${bad} hata</span>` : ''}</span>` : ''}${u.error ? html`<div class="tiny" style="color:var(--bad)">${u.error.slice(0, 160)}</div>` : ''}</td>
            <td class="r"><div class="row" style="justify-content:flex-end;gap:6px">${u.ref && u.status !== 'done' ? html`<button class="btn sm" data-act="check" data-id="${u.id}"><i class="ico ico-sync"></i>Durumu sorgula</button>` : ''}<button class="btn sm ghost" data-act="detail" data-id="${u.id}">Ayrıntı</button></div></td></tr>`; })}
          ${!st.uploads.length ? html`<tr><td colspan="6" class="empty">Henüz gönderim yok</td></tr>` : ''}
        </tbody></table></div></div>
      ${!c || !c.ready ? html`<div class="empty">Ürün yüklenebilecek bağlı pazaryeri yok. Trendyol / Hepsiburada API bilgilerini Entegrasyonlar'dan girin.</div>` : html`
      ${isAdmin() ? html`<div class="card stack" style="gap:10px">
        <h2 style="margin:0">Otomatik işlemler · ${c.name}</h2>
        <label class="row" style="align-items:flex-start;gap:12px"><span class="switch"><input type="checkbox" data-auto="auto_upload" ${c.auto ? 'checked' : ''}><span></span></span>
          <span><b>Yeni ürünleri otomatik gönder</b><br><span class="small muted">Her senkronda (15 dk) eşleştirilmiş kategorilerdeki, ${c.name}'da olmayan ve stoğu olan ürünler kendiliğinden gönderilir (eksik bilgisi olanlar atlanır). Eşleştirilmemiş kategoriler günde bir kez otomatik eşleştirilir.</span></span></label>
        <label class="row" style="align-items:flex-start;gap:12px"><span class="switch"><input type="checkbox" data-auto="stock_push" ${c.stockPush ? 'checked' : ''}><span></span></span>
          <span><b>Stokları ${c.name}'a gönder</b><br><span class="small muted">${st.stockSync ? 'Genel stok senkronu açık; stok zaten tüm kanallara gidiyor.' : `Genel stok senkronu kapalıyken bile ikas'taki stok adetleri yalnız ${c.name}'a gönderilir (değişen ilanlar, her senkronda).`}</span></span></label>
      </div>` : ''}
      <div class="card flush">
        <div class="card-head" style="padding:16px 16px 0"><h2>Kategori eşleştirme</h2><span class="spacer"></span>${isAdmin() ? html`<button class="btn sm" data-act="automap" title="Eşleştirilmemiş ikas kategorilerini en uygun ${c.name} kategorisine bağlar"><i class="ico ico-bolt"></i>Otomatik eşleştir</button><button class="btn sm" data-act="review" title="Mevcut eşleştirmeleri yeni algoritmayla kontrol eder; yanlış görünenler için daha uygun kategori önerir"><i class="ico ico-check"></i>Eşleştirmeleri kontrol et</button>` : ''}${isAdmin() ? html`<button class="btn sm" data-act="opts"><i class="ico ico-gear"></i>Kanal ayarları${c.opts.markup ? ` · fiyat %${c.opts.markup}` : ''}</button>` : ''}</div>
        <div class="table-wrap"><table class="t"><thead><tr><th>ikas kategorisi</th><th class="r">Ürün</th><th class="r">${c.name}'da</th><th>${c.name} kategorisi</th><th></th></tr></thead><tbody>
          ${st.categories.map((k) => { const m = mapOf(k.local), open = k.n - (k.listed[chId] || 0); return html`<tr>
            <td><b>${catName(k.local)}</b></td><td class="r num">${n(k.n)}</td><td class="r num">${n(k.listed[chId] || 0)}</td>
            <td>${m ? html`<span class="pill good">${m.remote_name || m.remote_id}</span> <span class="tiny muted">${Object.keys(m.attrs).length} özellik</span>` : html`<span class="muted small">eşleştirilmedi</span>`}</td>
            <td class="r"><div class="row" style="justify-content:flex-end;gap:6px">${isAdmin() ? html`<button class="btn sm" data-act="map" data-l="${k.local}">${m ? 'Düzenle' : 'Eşleştir'}</button>` : ''}
              ${m && open > 0 && isAdmin() ? html`<button class="btn sm primary" data-act="send" data-l="${k.local}"><i class="ico ico-upload"></i>${open} ürünü gönder</button>` : ''}</div></td></tr>`; })}
          ${!st.categories.length ? html`<tr><td colspan="5" class="empty">Ürün yok. Önce ikas ürünlerini içe aktarın.</td></tr>` : ''}
        </tbody></table></div></div>`}
    </div>`);
  }

  // ---------- eşleştirme penceresi ----------
  function mapSheet(local) {
    const c = C(), cur = mapOf(local);
    let cat = cur ? { id: cur.remote_id, name: cur.remote_name } : null, attrs = [], vals = {};
    const s = sheet({ title: `${catName(local)} → ${c.name}`, size: 'wide' });
    // Görsel adresi isteyen özellik (ör. Hepsiburada "Paket Görseli (ön)"): varsayılan ürün görseli
    const isImg = (a) => /g[öo]rsel|resim|foto[gğ]raf|image|photo/i.test(a.name || '') && !/enum|list|select/i.test(a.type || '');
    const valOf = (a) => (cur && cur.remote_id === (cat && cat.id) && cur.attrs[a.id]) || (a.kind === 'variant' ? { value: '@variant' } : isImg(a) ? { value: '@image' } : null);
    function body() {
      s.setBody(html`<div class="stack">
        <label class="field"><span>${c.name} kategorisi</span><input class="input" data-cq placeholder="Ara: gübre, toprak, pompa…" value="${cat ? cat.name : ''}"><div data-clist class="stack" style="gap:4px;margin-top:4px"></div></label>
        ${!cat ? html`<div data-sug><div class="muted small">Önerilen kategoriler aranıyor…</div></div>` : ''}
        ${cat ? html`<div class="small">Seçili: <b>${cat.name}</b> <span class="muted">(${cat.id})</span></div>` : ''}
        <div data-attrs>${cat ? html`<div class="muted small">Özellikler yükleniyor…</div>` : html`<div class="muted small">Önce kategori seçin.</div>`}</div>
      </div>`);
      s.setFoot(html`<div class="row" style="width:100%">${cur ? html`<button class="btn ghost danger" data-x="unmap">Eşleştirmeyi kaldır</button>` : ''}<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-x="save" ${cat ? '' : 'disabled'}>Kaydet</button></div>`);
      const cq = $('[data-cq]', s.body);
      cq.addEventListener('input', debounce(async () => {
        const q = cq.value.trim(); if (q.length < 2) return;
        try {
          const r = await api(`catalog/remote-categories?channel=${chId}&q=${encodeURIComponent(q)}`);
          render($('[data-clist]', s.body), html`${r.items.slice(0, 15).map((x) => html`<button class="cand" style="text-align:left;cursor:pointer" data-cid="${x.id}" data-cname="${x.name}"><span style="flex:1"><b>${x.name}</b><div class="tiny muted">${x.path || ''} · ${x.id}</div></span></button>`)}${!r.items.length ? html`<div class="muted small">Bulunamadı (${r.total} kategori tarandı)</div>` : ''}`);
        } catch (e) { render($('[data-clist]', s.body), html`<div class="notice bad small">${e.message}</div>`); }
      }, 350));
      if (cat) loadAttrs();
      else api(`catalog/suggest?channel=${chId}&local=${encodeURIComponent(local)}`).then((r) => {
        const box = $('[data-sug]', s.body); if (!box) return;
        render(box, r.items.length ? html`<div class="small" style="margin-bottom:4px"><b>Önerilen ${c.name} kategorileri</b> (ikas kategorisinin adına göre)</div>${r.items.map((x, i) => html`<button class="cand" style="text-align:left;cursor:pointer" data-cid="${x.id}" data-cname="${x.name}"><span style="flex:1"><b>${x.name}</b>${i === 0 ? html` <span class="pill good">en uygun</span>` : ''}<div class="tiny muted">${x.path || ''} · ${x.id}</div></span></button>`)}` : html`<div class="muted small">Otomatik öneri bulunamadı; yukarıdan arayın.</div>`);
      }).catch(() => {});
    }
    async function loadAttrs() {
      try {
        attrs = (await api(`catalog/attributes?channel=${chId}&category=${encodeURIComponent(cat.id)}`)).attributes;
        attrs.sort((a, b) => Number(b.mandatory) - Number(a.mandatory) || (b.kind === 'variant') - (a.kind === 'variant'));
        // Zorunlu ve varyant özelliklerinin değer listeleri baştan yüklenir
        await Promise.all(attrs.filter((a) => /enum|list|select/i.test(a.type) && (a.mandatory || a.kind === 'variant')).map(async (a) => { vals[a.id] = (await api(`catalog/values?channel=${chId}&category=${encodeURIComponent(cat.id)}&attribute=${encodeURIComponent(a.id)}`).catch(() => ({ values: [] }))).values; }));
        drawAttrs();
      } catch (e) { render($('[data-attrs]', s.body), html`<div class="notice bad small">${e.message}</div>`); }
    }
    function drawAttrs() {
      render($('[data-attrs]', s.body), html`<div class="stack">
        <p class="muted small" style="margin:0">Ürün adı, açıklama, marka, barkod, SKU, fiyat, KDV, desi, stok ve görsel üründen otomatik gelir. Burada yalnızca kategori özellikleri seçilir; bu kategorideki tüm ürünlere uygulanır. <b>Varyant adından</b> seçilirse her ürünün varyant adı (ör. “5 Kg”) kanalın listesinde eşlenir.</p>
        <div class="form-grid">${attrs.map((a) => { const v = valOf(a) || {}, fromVar = v.value === '@variant', fromImg = v.value === '@image', list = vals[a.id]; return html`<label class="field" data-a="${a.id}"><span>${a.name}${a.mandatory ? ' *' : ''}${a.kind === 'variant' ? html` <span class="pill">varyant</span>` : ''}</span>
          ${list && list.length ? html`<select class="input" data-v>${html`<option value="">—</option><option value="@variant" ${fromVar ? 'selected' : ''}>Ürünün varyant adından</option>`}${list.map((x) => html`<option value="${x.id}" ${v.id === x.id ? 'selected' : ''}>${x.value}</option>`)}</select>`
            : html`<div class="row" style="gap:6px"><input class="input" data-t value="${fromVar || fromImg ? '' : v.value || ''}" placeholder="${/enum|list|select/i.test(a.type) ? 'Listeden: Değerler' : isImg(a) ? 'Görsel adresi (https://…)' : 'Değer'}" ${fromVar || fromImg ? 'disabled' : ''}>${/enum|list|select/i.test(a.type) ? html`<button type="button" class="btn sm" data-x="vals">Değerler</button>` : ''}</div>
              ${isImg(a) ? html`<label class="check tiny"><input type="checkbox" data-img ${fromImg ? 'checked' : ''}> Ürün görselinden (her ürünün kendi görseli)</label>` : html`<label class="check tiny"><input type="checkbox" data-var ${fromVar ? 'checked' : ''}> Ürünün varyant adından</label>`}`}</label>`; })}</div>
        ${!attrs.length ? html`<div class="muted small">Bu kategoride ek özellik yok.</div>` : ''}
      </div>`);
    }
    s.el.addEventListener('click', async (e) => {
      const pickBtn = e.target.closest('[data-cid]');
      if (pickBtn) { cat = { id: pickBtn.dataset.cid, name: pickBtn.dataset.cname }; vals = {}; body(); return; }
      const x = e.target.closest('[data-x]'); if (!x) return;
      if (x.dataset.x === 'vals') {
        const f = x.closest('[data-a]'), id = f.dataset.a;
        await busy(x, async () => { vals[id] = (await api(`catalog/values?channel=${chId}&category=${encodeURIComponent(cat.id)}&attribute=${encodeURIComponent(id)}`)).values; drawAttrs(); });
      }
      if (x.dataset.x === 'unmap') await busy(x, async () => { await api('catalog/unmap', { method: 'POST', body: { local, channel: chId } }); s.close(); toast('Eşleştirme kaldırıldı'); await load(); });
      if (x.dataset.x === 'save') await busy(x, async () => {
        const out = {}, miss = [];
        for (const a of attrs) {
          const f = $(`[data-a="${CSS.escape(a.id)}"]`, s.body); if (!f) continue;
          const sel = $('[data-v]', f), t = $('[data-t]', f), cb = $('[data-var]', f), im = $('[data-img]', f);
          let v = null;
          if (sel && sel.value) v = sel.value === '@variant' ? { value: '@variant' } : { id: sel.value, value: sel.options[sel.selectedIndex].text };
          else if (cb && cb.checked) v = { value: '@variant' };
          else if (im && im.checked) v = { value: '@image' };
          else if (t && t.value.trim()) { const hit = (vals[a.id] || []).find((y) => y.value.toLocaleLowerCase('tr') === t.value.trim().toLocaleLowerCase('tr')); v = hit ? { id: hit.id, value: hit.value } : { value: t.value.trim() }; }
          if (v) out[a.id] = v; else if (a.mandatory) miss.push(a.name);
        }
        if (miss.length) toast('Boş zorunlu özellik: ' + miss.join(', ') + ' (yine de kaydedildi; bu ürünler gönderilmez)', true);
        await api('catalog/map', { method: 'POST', body: { local, channel: chId, remote_id: cat.id, remote_name: cat.name, attrs: out } });
        s.close(); if (!miss.length) toast('Eşleştirme kaydedildi'); await load();
      });
    });
    s.el.addEventListener('change', (e) => { if (e.target.matches('[data-var], [data-img]')) { const t = $('[data-t]', e.target.closest('[data-a]')); if (t) t.disabled = e.target.checked; } });
    body();
  }

  // ---------- gönderme penceresi ----------
  async function sendSheet(local) {
    const c = C();
    const s = sheet({ title: `${catName(local)} → ${c.name}: ürün gönder`, size: 'wide' });
    let zero = false, data = null;
    async function fill() {
      s.setBody(html`<div class="muted small">Ürünler kontrol ediliyor…</div>`);
      data = await api(`catalog/candidates?channel=${chId}&local=${encodeURIComponent(local)}&zero=${zero ? 1 : 0}`);
      const ready = data.items.filter((x) => !x.missing.length);
      s.setBody(html`<div class="stack">
        <div class="row wrap small"><span><b>${data.items.length}</b> ürün ${c.name}'da yok · <b style="color:var(--good)">${ready.length}</b> gönderime hazır${data.listed ? ` · ${data.listed} ürün zaten kanalda` : ''}</span><span class="spacer"></span>
          <label class="check"><input type="checkbox" data-zero ${zero ? 'checked' : ''}> Stok 0 gönder</label><label class="check"><input type="checkbox" data-all checked> Hazır olanların tümü</label></div>
        <div class="table-wrap" style="max-height:52vh;overflow:auto"><table class="t"><thead><tr><th></th><th>Ürün</th><th class="r">Fiyat</th><th class="r">Stok</th><th>Durum</th></tr></thead><tbody>
          ${data.items.map((x) => html`<tr><td><input type="checkbox" data-id="${x.id}" ${x.missing.length ? 'disabled' : 'checked'}></td>
            <td><div class="row" style="gap:8px">${thumb(x.image, x.name, 'sm')}<div style="min-width:0"><div class="ellipsis" style="max-width:340px">${x.name}</div><div class="tiny muted">${x.sku} · ${x.barcode || 'barkod yok'}</div></div></div></td>
            <td class="r num">${money(x.price)}</td><td class="r num">${x.stock}</td>
            <td>${x.missing.length ? html`<span class="tiny" style="color:var(--bad)">Eksik: ${x.missing.join(', ')}</span>` : x.sent ? html`<span class="pill warn">daha önce gönderildi</span>` : html`<span class="pill good">hazır</span>`}</td></tr>`)}
        </tbody></table></div>
        <p class="muted tiny" style="margin:0">Fiyat: ikas satış fiyatı${c.opts.markup ? ` + %${c.opts.markup} (kanal ayarı)` : ''}. Eksikleri ürün sayfasından ya da kategori eşleştirmesinden tamamlayın.</p>
      </div>`);
      s.setFoot(html`<div class="row" style="width:100%"><span class="spacer"></span><button class="btn" data-close>Kapat</button><button class="btn primary" data-x="go" ${ready.length ? '' : 'disabled'}><i class="ico ico-upload"></i>${C() && C().test ? 'Seçilenleri TEST ortamına gönder' : 'Seçilenleri gönder'}</button></div>`);
    }
    s.el.addEventListener('change', (e) => {
      if (e.target.matches('[data-zero]')) { zero = e.target.checked; fill().catch((err) => toast(err.message, true)); }
      if (e.target.matches('[data-all]')) $$('input[data-id]:not(:disabled)', s.body).forEach((i) => { i.checked = e.target.checked; });
    });
    s.el.addEventListener('click', async (e) => {
      const x = e.target.closest('[data-x=go]'); if (!x) return;
      const ids = $$('input[data-id]:checked', s.body).map((i) => Number(i.dataset.id));
      if (!ids.length) return toast('Ürün seçin', true);
      await busy(x, async () => {
        const r = await api('catalog/upload', { method: 'POST', body: { channel: chId, ids, zeroStock: zero } });
        s.close();
        toast(r.sent ? `${r.sent} ürün gönderildi${r.skipped.length ? ` · ${r.skipped.length} atlandı` : ''}. Onay sonucu sayfanın üstündeki “Gönderimler” bölümünde görünür.` : `Gönderilmedi: ${r.skipped.map((y) => y.name + ' (' + y.missing.join(', ') + ')').slice(0, 3).join('; ')}`, !r.sent);
        await load();
        if (r.sent) $('#gonderimler', el)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    await fill().catch((e) => s.setBody(html`<div class="notice bad">${e.message}</div>`));
  }

  function optsSheet() {
    const c = C();
    const s = sheet({ title: `${c.name}: yükleme ayarları` });
    s.setBody(html`<div class="stack">
      <label class="field"><span>Fiyat farkı (%)</span><input class="input" data-o="markup" inputmode="decimal" value="${c.opts.markup || ''}" placeholder="0"><small>ikas fiyatına eklenir (ör. komisyonu karşılamak için 10). Boşsa aynı fiyat.</small></label>
      ${c.options.map((o) => html`<label class="field"><span>${o.label}</span><input class="input" data-o="${o.k}" value="${c.opts[o.k] || ''}"></label>`)}
    </div>`);
    s.setFoot(html`<div class="row" style="width:100%"><span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-x="save">Kaydet</button></div>`);
    s.el.addEventListener('click', (e) => { const x = e.target.closest('[data-x=save]'); if (!x) return; busy(x, async () => {
      const opts = {}; $$('[data-o]', s.body).forEach((i) => { opts[i.dataset.o] = i.value.trim().replace(',', '.'); });
      await api('catalog/options', { method: 'POST', body: { channel: chId, opts } }); s.close(); toast('Kaydedildi'); await load();
    }); });
  }

  // Mevcut eşleştirmelerin denetimi: daha uygun kategori bulunanlar listelenir, seçilenler tek tıkla düzeltilir
  async function reviewSheet() {
    const c = C(), s = sheet({ title: `${c.name}: eşleştirme kontrolü`, size: 'wide', body: html`<div class="empty"><i class="ico ico-sync spin"></i> Kategoriler karşılaştırılıyor…</div>` });
    const r = await api(`catalog/review?channel=${chId}`).catch((e) => { s.setBody(html`<div class="notice bad">${e.message}</div>`); return null; });
    if (!r) return;
    if (!r.items.length) { s.setBody(html`<div class="notice good"><i class="ico ico-check"></i>Tüm eşleştirmeler uygun görünüyor; daha iyi bir kategori bulunamadı.</div>`); return; }
    s.setBody(html`<div class="stack"><div class="small muted">${r.items.length} eşleştirme için daha uygun kategori bulundu. Değiştirmek istediklerinizi işaretleyin (elle yaptığınız eşleştirmeler varsayılan olarak işaretsizdir).</div>
      <div class="table-wrap"><table class="t"><thead><tr><th></th><th>ikas kategorisi</th><th>Şu anki</th><th>Önerilen</th></tr></thead><tbody>
      ${r.items.map((x, i) => html`<tr><td><input type="checkbox" class="cb" data-ri="${i}" ${x.auto ? 'checked' : ''}></td><td><b>${catName(x.local)}</b></td>
        <td><span class="pill bad">${x.current.name || x.current.id}</span>${x.current.score != null ? html` <span class="tiny muted">uyum ${n(x.current.score)}</span>` : ''}</td>
        <td><span class="pill good">${x.best.name}</span> <span class="tiny muted">uyum ${n(x.best.score)}</span><div class="tiny muted">${x.best.path || ''}</div></td></tr>`)}
      </tbody></table></div></div>`);
    s.setFoot(html`<div class="row" style="width:100%"><span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-x="apply">Seçilenleri düzelt</button></div>`);
    s.el.addEventListener('click', (e) => { const b = e.target.closest('[data-x=apply]'); if (!b) return; busy(b, async () => {
      const items = $$('[data-ri]', s.body).filter((x) => x.checked).map((x) => { const it = r.items[Number(x.dataset.ri)]; return { local: it.local, id: it.best.id, name: it.best.name }; });
      if (!items.length) return toast('Seçim yok', true);
      const res = await api('catalog/review/apply', { method: 'POST', body: { channel: chId, items } });
      s.close(); toast(`${res.count} eşleştirme düzeltildi — zorunlu özellikleri “Düzenle” ile kontrol edin`); await load();
    }); });
  }

  function detailSheet(u) {
    sheet({ title: `Gönderim #${u.id} · ${u.items.length} ürün`, size: 'wide', body: html`<div class="stack">
      ${u.ref ? html`<div class="small">Takip no: <b class="num">${u.ref}</b>${u.checked_at ? html` · son sorgu ${dateTime(u.checked_at)}` : ''}</div>` : ''}
      ${u.error ? html`<div class="notice bad small">${u.error}</div>` : ''}
      <div class="table-wrap" style="max-height:60vh;overflow:auto"><table class="t"><thead><tr><th>Ürün</th><th>Anahtar</th><th>Sonuç</th></tr></thead><tbody>
        ${u.items.map((x) => html`<tr><td class="ellipsis" style="max-width:300px">${x.name}</td><td class="num small">${x.key}</td>
          <td>${x.ok === true ? html`<span class="pill good">onaylandı</span>` : x.ok === false ? html`<span class="pill bad">hata</span>` : html`<span class="pill warn">${x.status || 'bekliyor'}</span>`}${x.error ? html`<div class="tiny" style="color:var(--bad)">${x.error}</div>` : ''}</td></tr>`)}
      </tbody></table></div></div>` });
  }

  actions(el, {
    ch: (t) => { chId = t.dataset.id; store.set('upload_ch', chId); draw(); },
    map: (t) => mapSheet(t.dataset.l),
    send: (t) => sendSheet(t.dataset.l),
    opts: () => optsSheet(),
    automap: (t) => busy(t, async () => {
      const r = await api('catalog/automap', { method: 'POST', body: { channel: chId } });
      toast(`${r.mapped.length} kategori otomatik eşleştirildi${r.skipped.length ? ` · ${r.skipped.length} kategori için uygun eşleşme bulunamadı (elle eşleştirin)` : ''}${r.mapped.some((x) => x.missing.length) ? ' · bazılarında zorunlu özellik eksik, “Düzenle” ile tamamlayın' : ''}`);
      await load();
    }),
    review: () => reviewSheet(),
    check: (t) => busy(t, async () => { const r = await api(`catalog/uploads/${t.dataset.id}/check`, { method: 'POST' }); toast(r.done ? 'Kanal işlemi tamamladı' : 'Kanal hâlâ işliyor, birazdan tekrar sorgulayın'); await load(); }),
    detail: (t) => detailSheet(st.uploads.find((u) => String(u.id) === t.dataset.id)),
    allup: () => { allUp = !allUp; draw(); },
  });
  // Otomatik işlem anahtarları (kanal bazında): ayarlara kaydedilir
  el.addEventListener('change', async (e) => {
    const k = e.target.dataset && e.target.dataset.auto;
    if (!k) return;
    try {
      const cur = (state.settings && state.settings[k]) || {};
      state.settings = await api('settings', { method: 'PUT', body: { [k]: { ...cur, [chId]: e.target.checked } } });
      toast(e.target.checked ? (k === 'auto_upload' ? 'Otomatik ürün gönderimi açıldı' : 'Stok gönderimi açıldı') : 'Kapatıldı');
      await load();
    } catch (err) { e.target.checked = !e.target.checked; toast(err.message, true); }
  });
  await load();
}
