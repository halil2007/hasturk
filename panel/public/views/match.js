// Eşleştirme: FARKLI kanallardaki aynı ürünü / varyantı tek panel ürününe bağlar. Bir ürüne her kanaldan yalnızca bir ilan
// bağlanır; ana katalog sitesinin her varyantı kendi ürünüdür (aynı sitenin ürünleri birbiriyle eşleştirilmez).
// Kesin olanlar (barkod, stok kodu, ad + varyant birebir) senkronda otomatik bağlanır; tereddütlüler burada onaya düşer.
// İkinci eşleşme: aynı ürünün aynı kanaldaki ikinci ilanı yalnız kullanıcı onayıyla bağlanır (öneri ya da elle; bkz. src/second.js).
import { api, html, render, $, n, money, ch, chBadge, chLogo, thumb, actions, busy, toast, debounce, sheet, activeChannels, confirmBox, ek } from '../core.js';
import { setQuery, loadSummary } from '../app.js';

const TABS = [['', 'Onay bekleyen'], ['second', 'İkinci eşleşme önerileri'], ['linked', 'Eşleşmiş ürünler'], ['ignored', 'Yok sayılan']];
export const HOW = { barcode: ['good', 'Barkod'], sku: ['good', 'Stok kodu'], name: ['good', 'Ad + varyant'], group: ['good', 'Aynı ürün grubu'], approved: ['amber', 'Toplu onay'], new: ['info', 'Katalogdan'], manual: ['amber', 'Elle'], extra: ['info', 'İkinci ilan'], dup_ok: ['info', 'İkinci ilan'] };
// Aynı kanalda birden fazla ilan: "Bu ürün Hepsiburada'da 2 ilanla satılacak…" (onay penceresi)
export const twoText = (chId, count) => `Bu ürün ${ek(ch(chId).name, 'da')} ${count} ilanla satılacak. Stok ${count === 2 ? 'iki' : 'tüm'} ilanda da aynı gösterilir.`;
// Ürünün bu kanaldaki kaçıncı ilanı (aynı kanalda birden fazlaysa "İlan 1 / İlan 2"; tek ilansa boş)
export const ilanNo = (list, l) => { const xs = (list || []).filter((x) => x.channel === l.channel); return xs.length > 1 ? `İlan ${xs.indexOf(l) + 1}` : ''; };
const howPill = (m) => { const [c, t] = HOW[m] || ['', m || '—']; return html`<span class="pill ${c}" title="Eşleşme yöntemi">${t}</span>`; };
const scoreCls = (s) => (s >= 70 ? 'hi' : s >= 45 ? 'mid' : 'lo');
const ids = (l) => html`<div class="muted tiny">${[l.sku && `SKU ${l.sku}`, l.barcode && `Barkod ${l.barcode}`].filter(Boolean).join(' · ') || 'SKU/barkod yok'}</div>`;
const vtag = (v, name) => (v && !String(name || '').includes(v) ? html`<span class="var-tag">${v}</span>` : '');

export async function matching(el, rest, query = {}) {
  const f = { tab: query.tab || '', channel: query.channel || '', q: query.q || '', multi: query.multi ?? '1', page: 1 };
  let data = { listings: [], counts: [] }, secondN = 0;
  render(el, html`<div class="stack">
    
    <div class="kpis" data-kpis></div>
    <div class="row wrap page-actions">
      <div class="tabs" data-tabs></div>
      <span class="spacer"></span>
      <div class="search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün adı, SKU veya barkod" data-q value="${f.q}"></div>
      <button class="btn" data-act="auto"><i class="ico ico-sync"></i>Şimdi eşleştir</button>
      <button class="btn" data-act="approve" title="En iyi aday en az 85 puan ve ikinci adaydan 15 puan öndeyse bağlar"><i class="ico ico-check"></i>Güçlü önerileri onayla</button>
      <button class="btn ghost" data-act="repair" title="Aynı kanaldan birden fazla ilanın tek ürüne bağlandığı eski eşleşmeleri ayırır">Hatalı eşleşmeleri onar</button>
    </div>
    <div class="row wrap"><div class="tabs" style="flex:1" data-chs></div><select class="input" style="width:auto" data-multi hidden>
      <option value="1">Birden fazla kanalda olanlar</option><option value="0">Tek kanalda olanlar</option><option value="">Tümü</option></select></div>
    <div data-box></div>
  </div>`);
  $('[data-multi]', el).value = f.multi;

  function head() {
    const c = data.counts || [];
    const sum = (k) => c.reduce((a, x) => a + (x[k] || 0), 0);
    render($('[data-kpis]', el), html`
      <div class="kpi"><div class="label">Kanal ilanı</div><div class="value num">${n(sum('total'))}</div><div class="delta flat">${n(sum('created'))} ana katalogdan ürün</div></div>
      <div class="kpi"><div class="label">Otomatik eşleşen</div><div class="value num">${n(sum('auto'))}</div><div class="delta flat">barkod / stok kodu / ad + varyant</div></div>
      <div class="kpi"><div class="label">Elle eşleşen</div><div class="value num">${n(sum('manual'))}</div><div class="delta flat">sizin onayınızla</div></div>
      <div class="kpi"><div class="label">Onay bekleyen</div><div class="value num ${sum('pending') ? 'down' : ''}">${n(sum('pending'))}</div><div class="delta flat">${n(sum('ignored'))} yok sayıldı</div></div>`);
    render($('[data-tabs]', el), html`${TABS.map(([k, t]) => html`<button class="tab ${f.tab === k ? 'on' : ''}" data-act="tab" data-k="${k}">${k === 'second' ? `${t} (${secondN})` : t}${k === '' && sum('pending') ? html`<span class="n">${sum('pending')}</span>` : ''}</button>`)}`);
    const by = Object.fromEntries(c.map((x) => [x.channel, x]));
    render($('[data-chs]', el), html`<button class="tab ${!f.channel ? 'on' : ''}" data-act="ch" data-k="">Tüm kanallar</button>${activeChannels().filter((x) => by[x.id]).map((x) => html`<button class="tab ${f.channel === x.id ? 'on' : ''}" data-act="ch" data-k="${x.id}">${chBadge(x.id)}${f.tab === '' && by[x.id].pending ? html`<span class="n">${by[x.id].pending}</span>` : ''}</button>`)}`);
    $('[data-multi]', el).hidden = f.tab !== 'linked';
  }

  const pendingCard = (l) => html`<div class="card stack" data-key="${l.channel}|${l.remote_id}" data-q="${[l.sku, l.barcode, l.name].map((v) => v || '').join('\u001f')}">
    <div class="row" style="align-items:flex-start">${thumb(l.image, l.name)}
      <div style="flex:1;min-width:0"><div style="font-weight:650">${l.name || l.remote_id}${vtag(l.variant_name, l.name)}</div>${ids(l)}
        <div class="row small wrap" style="margin-top:4px;gap:12px">${chBadge(l.channel)}<span class="muted">${money(l.price)}</span><span class="muted">Stok ${l.remote_stock ?? '—'}</span></div></div></div>
    ${l.candidates.length ? html`<div><div class="muted tiny" style="font-weight:700;margin-bottom:6px">OLASI KARŞILIKLARI (diğer kanallardaki ürünler)</div>${l.candidates.map((c) => html`<div class="cand">
      <span class="score ${scoreCls(c.score)}" title="Benzerlik puanı">%${c.score}</span>${thumb(c.image, c.name, 'sm')}
      <div style="flex:1;min-width:0"><div class="ellipsis" style="font-weight:600">${c.name}</div>
        <div class="muted tiny ellipsis">${(c.channels || []).map((x) => `${ch(x.channel).short || ch(x.channel).name}: ${x.name}`).join(' · ') || 'kanalda ilanı yok'}</div>
        <div class="muted tiny ellipsis">${[c.sku, c.barcode, `stok ${c.stock}`].filter(Boolean).join(' · ')}${c.why.length ? ' — ' + c.why.join(', ') : ''}</div></div>
      <button class="btn sm primary" data-act="link" data-pid="${c.product_id}">Bağla</button></div>`)}</div>`
      : html`<div class="muted small">Diğer kanallarda benzer ürün bulunamadı. Ürün arayarak bağlayın veya yeni ürün olarak ekleyin.</div>`}
    <div class="row wrap"><button class="btn sm" data-act="find"><i class="ico ico-search"></i>Ürün ara</button><button class="btn sm" data-act="create"><i class="ico ico-plus"></i>Yeni ürün olarak ekle</button><span class="spacer"></span><button class="btn sm ghost" data-act="ignore">Yok say</button></div>
  </div>`;

  // Eşleşmiş ürün: panel ürünü + her kanaldaki bağlı ilanı
  const groupCard = (p) => html`<div class="card flush" data-pid="${p.id}">
    <div class="card-pad row" style="align-items:flex-start;border-bottom:1px solid var(--line)">${thumb(p.image, p.name)}
      <div style="flex:1;min-width:0"><a class="link" style="font-weight:700" href="#/urunler/${p.id}">${p.group_name && p.variant_name ? p.group_name : p.name}</a>${vtag(p.variant_name, p.group_name && p.variant_name ? p.group_name : p.name)}${ids(p)}</div>
      <span class="pill ${new Set(p.listings.map((l) => l.channel)).size > 1 ? 'good' : ''}">${new Set(p.listings.map((l) => l.channel)).size} kanal</span>
      <button class="btn sm ghost" data-act="addl" title="Aynı kanaldan bir ilan daha bağla">İlan ekle</button></div>
    ${p.listings.map((l) => html`<div class="link-row" data-key="${l.channel}|${l.remote_id}" data-q="${[l.sku, l.barcode, l.name].map((v) => v || '').join('\u001f')}">
      <span class="ch-name" style="min-width:120px">${chLogo(l.channel, true)}<span class="ellipsis">${ch(l.channel).short || ch(l.channel).name}</span>${ilanNo(p.listings, l) ? html`<span class="pill info" style="padding:2px 8px;font-size:11px">${ilanNo(p.listings, l)}</span>` : ''}</span>
      ${thumb(l.image, l.name, 'sm')}
      <div style="flex:1;min-width:0"><div class="ellipsis" style="font-weight:600">${l.name}${vtag(l.variant_name, l.name)}</div><div class="muted tiny ellipsis">${[l.sku && `SKU ${l.sku}`, l.barcode && `Barkod ${l.barcode}`, money(l.price), `stok ${l.remote_stock ?? '—'}`].filter(Boolean).join(' · ')}</div></div>
      ${howPill(l.match)}
      <div class="row" style="gap:4px"><button class="btn sm ghost" data-act="find" title="Bu ilanı başka bir ürüne bağla">Taşı</button><button class="btn sm ghost danger" data-act="unlink" title="Bağlantıyı kaldır">Kaldır</button></div>
    </div>`)}
  </div>`;

  // İkinci eşleşme önerisi: panel ürünü (bu kanalda zaten ilanı var) + aynı kanaldaki aday ilan
  const secondCard = (x) => html`<div class="card stack" data-key="${x.channel}|${x.remote_id}" data-pid="${x.product.id}">
    <div class="row wrap" style="gap:8px"><span class="pill info">İkinci eşleşme önerisi</span>${chBadge(x.channel)}<span class="spacer"></span><span class="score ${scoreCls(x.score)}" title="Benzerlik puanı">%${x.score}</span></div>
    <div style="font-weight:650">Bu ilan da bu ürün olabilir mi?</div>
    <div><div class="muted tiny" style="font-weight:700;margin-bottom:6px">ÜRÜN (bu kanalda ${x.existing.length} ilanı var)</div>
      <div class="cand">${thumb(x.product.image, x.product.name, 'sm')}<div style="flex:1;min-width:0"><a class="link ellipsis" style="font-weight:600;display:block" href="#/urunler/${x.product.id}">${x.product.name}</a>
        <div class="muted tiny ellipsis">${[x.product.sku && `SKU ${x.product.sku}`, x.product.barcode && `Barkod ${x.product.barcode}`, `stok ${x.product.stock}`].filter(Boolean).join(' · ')}</div>
        ${x.existing.map((e) => html`<div class="muted tiny ellipsis">İlan: ${e.name} · ${money(e.price)}</div>`)}</div></div></div>
    <div><div class="muted tiny" style="font-weight:700;margin-bottom:6px">AYNI KANALDAKİ DİĞER İLAN</div>
      <div class="cand">${thumb(x.image, x.name, 'sm')}<div style="flex:1;min-width:0"><div class="ellipsis" style="font-weight:600">${x.name || x.remote_id}${vtag(x.variant_name, x.name)}</div>${ids(x)}
        <div class="muted tiny">${money(x.price)} · stok ${x.remote_stock ?? '—'}</div></div></div></div>
    <div class="muted tiny">Neden: ${x.why}</div>
    <div class="row wrap"><button class="btn sm primary" data-act="sapprove"><i class="ico ico-check"></i>Onayla</button><button class="btn sm" data-act="sreject">Hayır, farklı ürün</button></div>
    <div class="muted tiny">Onaylarsanız stok iki ilanda da aynı gösterilir; fiyat her ilanda ayrı kalır.</div>
  </div>`;

  const ignoredRow = (l) => html`<div class="cand" data-key="${l.channel}|${l.remote_id}">${chBadge(l.channel)}${thumb(l.image, l.name, 'sm')}
    <div style="flex:1;min-width:0"><div class="ellipsis" style="font-weight:600">${l.name}</div>${ids(l)}</div>${l.match === 'zero' ? html`<span class="pill" title="Stoğu gelince eşleştirmeye kendiliğinden döner">Stok 0 · stok gelince döner</span>` : html`<button class="btn sm" data-act="unignore">Geri al</button>`}</div>`;

  function draw() {
    head();
    const box = $('[data-box]', el);
    if (f.tab === 'linked') {
      const P = data.products || [];
      if (!P.length) return render(box, html`<div class="card"><div class="empty">Bu filtrede eşleşmiş ürün yok</div></div>`);
      return render(box, html`<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,560px),1fr));gap:12px">${P.map(groupCard)}</div>
        <div class="pager"><span class="muted small" style="margin-right:auto">${n(data.total)} ürün</span>${P.length < data.total ? html`<button class="btn sm" data-act="more">Daha fazla</button>` : ''}</div>`);
    }
    if (f.tab === 'second') {
      const S = data.second || [];
      if (!S.length) return render(box, html`<div class="card"><div class="empty">İkinci eşleşme önerisi yok</div></div>`);
      return render(box, html`<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,460px),1fr));gap:12px">${S.map(secondCard)}</div>`);
    }
    const L = data.listings || [];
    if (!L.length) return render(box, html`<div class="card"><div class="empty">${f.tab === '' ? 'Onay bekleyen ilan yok 🎉' : 'Kayıt yok'}</div></div>`);
    if (f.tab === 'ignored') return render(box, html`<div class="card">${L.map(ignoredRow)}</div>`);
    render(box, html`<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,460px),1fr));gap:12px">${L.map(pendingCard)}</div>`);
  }

  async function load(append = false) {
    setQuery({ tab: f.tab, channel: f.channel, q: f.q, multi: f.tab === 'linked' && f.multi !== '1' ? f.multi || 'all' : '' });
    const p = new URLSearchParams();
    if (f.channel) p.set('channel', f.channel);
    if (f.q) p.set('q', f.q);
    const sec = (lim) => api(`match/second?limit=${lim}${f.tab === 'second' ? '&' + p : ''}`).catch(() => ({ items: [], total: 0 }));
    if (f.tab === 'second') {
      const [r, c] = await Promise.all([sec(100), api('match?limit=1')]);
      data = { second: r.items, counts: c.counts };
      secondN = r.total;
    } else if (f.tab === 'linked') {
      if (f.multi) p.set('multi', f.multi);
      p.set('page', f.page);
      const [r, c] = await Promise.all([api('match/groups?' + p), api('match?limit=1')]);
      data = { products: append ? (data.products || []).concat(r.products) : r.products, total: r.total, counts: c.counts };
    } else if (f.tab === 'ignored') {
      p.set('unlinked', '1');
      const [r, c] = await Promise.all([api('listings?' + p), api('match?limit=1')]);
      data = { listings: r.listings.filter((l) => l.ignored), counts: c.counts };
    } else data = await api('match?limit=100&' + p);
    if (f.tab !== 'second') secondN = (await sec(1)).total;
    draw();
  }
  const refresh = () => { f.page = 1; return load().catch((e) => toast(e.message, true)); };
  const keyOf = (t) => { const [channel, ...r] = t.closest('[data-key]').dataset.key.split('|'); return { channel, remote_id: r.join('|') }; };
  const done = (t, msg) => { const card = t.closest('[data-key]'); if (card && f.tab !== 'linked') card.remove(); toast(msg); loadSummary().catch(() => {}); refresh(); };
  const link = (k, pid) => api('listings/link', { method: 'POST', body: { ...k, product_id: pid } });

  actions(el, {
    tab: (t) => { f.tab = t.dataset.k; refresh(); },
    ch: (t) => { f.channel = t.dataset.k; refresh(); },
    more: (t) => busy(t, async () => { f.page++; await load(true); }),
    link: (t) => busy(t, async () => { await link(keyOf(t), Number(t.dataset.pid)); done(t, 'Eşleştirildi'); }),
    create: (t) => busy(t, async () => { await api('listings/link', { method: 'POST', body: { ...keyOf(t), create: true } }); done(t, 'Yeni ürün oluşturuldu ve bağlandı'); }),
    ignore: (t) => busy(t, async () => { await api('match/ignore', { method: 'POST', body: keyOf(t) }); done(t, 'Yok sayıldı'); }),
    unignore: (t) => busy(t, async () => { await api('match/ignore', { method: 'POST', body: { ...keyOf(t), ignored: false } }); done(t, 'Bekleyenlere geri alındı'); }),
    unlink: (t) => busy(t, async () => { await api('match/unlink', { method: 'POST', body: keyOf(t) }); done(t, 'Eşleşme kaldırıldı; ilan tekrar otomatik olarak bu ürüne bağlanmaz'); }),
    repair: (t) => busy(t, async () => { const r = await api('match/repair', { method: 'POST' }); toast(`${r.freed} hatalı bağlantı ayrıldı · ${r.linked} ilan yeniden kesin eşleşti`); loadSummary().catch(() => {}); refresh(); }),
    approve: (t) => busy(t, async () => {
      if (!(await confirmBox('85 puan ve üzeri, ikinci adaydan belirgin önde olan öneriler bağlansın mı? Yanlış olanı “Eşleşmiş ürünler”den kaldırabilirsiniz.', 'Onayla'))) return;
      const r = await api('match/approve', { method: 'POST', body: { channel: f.channel || undefined } }); toast(`${r.linked} öneri onaylandı`); loadSummary().catch(() => {}); refresh();
    }),
    auto: (t) => busy(t, async () => { const r = await api('sync', { method: 'POST', body: { force: true, listings: true } }); toast(r.skipped || `${(r.match && r.match.linked) || 0} ilan otomatik eşleşti, ${(r.match && r.match.created) || 0} yeni ürün`); loadSummary().catch(() => {}); refresh(); }),
    find: (t) => { const [sku, barcode, name] = (t.closest('[data-q]')?.dataset.q || '').split('\u001f'); findProduct(keyOf(t), () => done(t, 'Eşleştirildi'), undefined, { q: guessQ({ sku, barcode, name }) }); },
    sapprove: (t) => busy(t, async () => { const pid = Number(t.closest('[data-pid]').dataset.pid); const r = await api('products/second-match/approve', { method: 'POST', body: { ...keyOf(t), product_id: pid } }); done(t, r.extra ? `Bağlandı: ürün bu kanalda ${r.count} ilanla satılacak` : 'Bağlandı'); }),
    sreject: (t) => busy(t, async () => { const pid = Number(t.closest('[data-pid]').dataset.pid); await api('products/second-match/reject', { method: 'POST', body: { ...keyOf(t), product_id: pid } }); done(t, 'Tamam, bu öneri bir daha gösterilmez'); }),
    addl: (t) => { const p = (data.products || []).find((x) => x.id === Number(t.closest('[data-pid]').dataset.pid)); if (p) addListing(p, () => { toast('İlan bağlandı'); refresh(); }); },
  });
  $('[data-q]', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); refresh(); }, 300));
  $('[data-multi]', el).addEventListener('change', (e) => { f.multi = e.target.value; refresh(); });
  await refresh();
  return { refresh };
}

// Ürün arayıp seçilen ürüne bağla. Aynı kanaldan zaten ilanı olan ürün seçilemez. (Kanal Ürünleri sayfası da kullanır)
// opts.q: arama kutusuna hazır yazılacak metin (dizi verilirse sonuç veren ilk aday); opts.link(productId): bağlama isteğini kendisi yapar (Sipariş → Ürünle eşleştir)
// İlanın SKU / barkod / adından arama adayları (sonuç veren ilki kutuya yazılır)
export const guessQ = (x) => { const w = String(x.name || '').split(/\s+/).filter(Boolean); return [x.sku, x.barcode, x.name, w.slice(0, 3).join(' '), w.slice(0, 2).join(' ')]; };
export function findProduct(key, onDone, endpoint = 'listings/link', opts = {}) {
  const s = sheet({
    title: opts.title || `${ch(key.channel).name} ilanını bağla`, size: 'narrow',
    body: html`<div class="stack"><div class="search" style="min-width:0"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün adı, SKU veya barkod" data-pq></div><div data-res class="stack" style="gap:6px"></div></div>`,
  });
  const res = $('[data-res]', s.el), inp = $('[data-pq]', s.el);
  const search = async (q, tries) => {
    let r = await api('products?limit=15&filter=all&q=' + encodeURIComponent(q)).catch(() => ({ products: [] }));
    // İlk açılışta sonuç yoksa sıradaki aday denenir (SKU → barkod → ad → adın ilk kelimeleri); kutuya bulunan yazılır
    for (const t of tries || []) {
      if (r.products.length) break;
      r = await api('products?limit=15&filter=all&q=' + encodeURIComponent(t)).catch(() => ({ products: [] }));
      if (r.products.length) inp.value = t;
    }
    render(res, r.products.length ? html`${r.products.map((p) => {
      const mine = (p.listings || []).find((l) => l.channel === key.channel);
      const same = mine && mine.remote_id === key.remote_id;
      return html`<div class="cand">${thumb(p.image, p.name, 'sm')}<div style="flex:1;min-width:0"><div class="cand-name">${p.name}${vtag(p.variant_name, p.name)}</div>
        <div class="muted tiny cand-meta">${[p.sku, p.barcode, `stok ${p.stock}`].filter(Boolean).join(' · ')}${(p.listings || []).length ? ' · ' + [...new Set(p.listings.map((l) => ch(l.channel).short || l.channel))].join(', ') : ''}</div></div>
        ${same ? html`<span class="pill good">Bağlı</span>` : mine ? html`<button class="btn sm" data-pick2="${p.id}" data-n="${(p.listings || []).filter((l) => l.channel === key.channel).length + 1}" title="Bu ürünün bu kanalda zaten ilanı var: bu ilanı ikinci ilan olarak bağlar">2. ilan olarak bağla</button>` : html`<button class="btn sm primary" data-pick="${p.id}">Bağla</button>`}</div>`;
    })}` : html`<div class="muted small">Sonuç yok</div>`);
  };
  $('[data-pq]', s.el).addEventListener('input', debounce((e) => search(e.target.value.trim()), 250));
  res.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (b) busy(b, async () => { const pid = Number(b.dataset.pick); await (opts.link ? opts.link(pid) : api(endpoint, { method: 'POST', body: { ...key, product_id: pid } })); s.close(); onDone(); });
    const b2 = e.target.closest('[data-pick2]');
    if (b2) busy(b2, async () => {
      if (!(await confirmBox(twoText(key.channel, Number(b2.dataset.n)), 'Bağla'))) return;
      const pid = Number(b2.dataset.pick2);
      await (opts.link ? opts.link(pid) : api('products/second-match/approve', { method: 'POST', body: { ...key, product_id: pid } })); s.close(); onDone();
    });
  });
  const tries = [...new Set((Array.isArray(opts.q) ? opts.q : [opts.q]).map((x) => String(x || '').trim()).filter(Boolean))];
  inp.value = tries[0] || '';
  search(inp.value, tries.slice(1));
  setTimeout(() => { inp.focus(); inp.select(); }, 50);
}

// Ürüne aynı (ya da başka) kanaldan bir ilan daha bağla: ilan ara, onay penceresi ("Bu ürün … 2 ilanla satılacak"). Eşleştirme ve ürün formu kullanır.
export function addListing(p, onDone, chId) {
  const mine = [...new Set((p.listings || []).map((l) => l.channel))];
  const chans = [...mine.map((id) => ch(id)), ...activeChannels().filter((c) => !mine.includes(c.id) && (c.enabled || c.demo))];
  const f = { channel: chId || mine[0] || (chans[0] && chans[0].id) || '', q: '' };
  const s = sheet({
    title: 'İlan ekle', size: 'narrow',
    body: html`<div class="stack"><div class="muted small">${p.group_name && p.variant_name ? `${p.group_name} · ${p.variant_name}` : p.name}</div>
      <select class="input" data-lch>${chans.map((c) => html`<option value="${c.id}" ${c.id === f.channel ? 'selected' : ''}>${c.name}${mine.includes(c.id) ? ` (${(p.listings || []).filter((l) => l.channel === c.id).length} ilan bağlı)` : ''}</option>`)}</select>
      <div class="search" style="min-width:0"><i class="ico ico-search"></i><input class="input" type="search" placeholder="İlan adı, SKU veya barkod" data-lq></div>
      <div data-res class="stack" style="gap:6px"></div></div>`,
  });
  const res = $('[data-res]', s.el);
  const search = async () => {
    if (!f.channel) return render(res, html`<div class="muted small">Kanal seçin</div>`);
    const r = await api(`products/second-match/listings?product_id=${p.id}&channel=${encodeURIComponent(f.channel)}&q=${encodeURIComponent(f.q)}`).catch((e) => ({ listings: [], error: e.message }));
    render(res, r.listings.length ? html`${r.listings.map((l) => html`<div class="cand">${thumb(l.image, l.name, 'sm')}<div style="flex:1;min-width:0"><div class="ellipsis" style="font-weight:600">${l.name || l.remote_id}${vtag(l.variant_name, l.name)}</div>${ids(l)}
        <div class="muted tiny ellipsis">${money(l.price)} · stok ${l.remote_stock ?? '—'}${l.product_id ? ` · bağlı: ${l.product_name || ''}` : ''}</div></div>
      ${l.product_id ? html`<span class="pill" title="Bu ilan başka bir ürüne bağlı; önce Eşleştirme'den kaldırın">Başka üründe</span>` : html`<button class="btn sm primary" data-rid="${l.remote_id}">Bağla</button>`}</div>`)}`
      : html`<div class="muted small">${r.error || 'Sonuç yok'}</div>`);
  };
  $('[data-lch]', s.el).addEventListener('change', (e) => { f.channel = e.target.value; search(); });
  $('[data-lq]', s.el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); search(); }, 250));
  res.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rid]');
    if (!b) return;
    busy(b, async () => {
      const count = (p.listings || []).filter((l) => l.channel === f.channel).length + 1;
      if (count > 1 && !(await confirmBox(twoText(f.channel, count), 'Bağla'))) return;
      await api('products/second-match/approve', { method: 'POST', body: { channel: f.channel, remote_id: b.dataset.rid, product_id: p.id } });
      s.close(); onDone && onDone();
    });
  });
  search();
}
