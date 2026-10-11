// Avantajlı etiketler: Trendyol yıldızlı / avantajlı ürün etiketi eşikleri, Hepsiburada flaş indirim / kampanya davetleri (Excel'den).
// Akış: Excel yükle → her eşikte kârı gör, satır başına fiyat seç → Excel'i indir (pazaryerinin dosyası aynı düzende, seçilen fiyatlar
// pazaryerinin beklediği sütunda) → pazaryerine yükle. İsteğe bağlı: seçilen fiyatları doğrudan kanala gönder (bkz. src/promos.js).
import { api, state, html, raw, render, $, n, money, date, ago, ch, chLogo, thumb, actions, busy, toast, confirmBox } from '../core.js';
import { readGrid, csvRows } from '../sheetread.js';
import { patchXlsx, buildXlsx, buildCsv, saveFile, XLSX_TYPE } from '../sheetwrite.js';
import { profit } from '../profit.js';

const KINDS = [['advantage', 'Avantajlı ürün etiketi'], ['flash', 'Flaş indirim'], ['deal', 'Kampanya daveti']];
const kindName = (k) => (KINDS.find((x) => x[0] === k) || [k, k])[1];
const defKind = (type) => (type === 'hepsiburada' ? 'flash' : 'advantage');
// Excel'in nereden indirileceği (kanal türüne göre)
const WHERE = {
  trendyol: 'Trendyol satıcı paneli → Promosyon &amp; Fiyat → <b>Yıldızlı / Avantajlı Ürün Etiketleri</b> → Excel\'e aktar.',
  hepsiburada: 'Hepsiburada satıcı paneli → Kampanyalar → <b>flaş indirim / kampanya daveti</b> → ürün listesini Excel olarak indir.',
};
const marg = (x) => (x && x.margin != null ? html`<span class="tiny ${x.margin < 0 ? 'neg' : x.margin < 8 ? 'warn-t' : 'pos'}">${money(x.profit)} · %${n(Math.round(x.margin))}</span>` : html`<span class="tiny muted" title="Ürünün alış fiyatı girilmemiş (Ürünler)">kâr ?</span>`);
const calc = (c, price, rate) => {
  if (!c || !(c.purchase > 0) || !(price > 0)) return null;
  const x = profit({ sale: price, purchase: c.purchase, commissionRate: rate, shipping: c.shipping, fee: c.fee, feeRate: c.feeRate, withholdingRate: c.withholding, vatRate: c.vat });
  return { profit: Math.round(x.unitProfit * 100) / 100, margin: Math.round(x.margin * 100) / 100, loss: x.unitProfit < 0 };
};
const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const outName = (name, ext) => `${String(name || 'liste').replace(/\.(xlsx|xls|csv|txt)$/i, '')}-hasturk.${ext}`;

export async function promosView(el) {
  const chs = () => state.channels.filter((c) => !c.paused && c.type !== 'ikas' && !['shopify', 'woocommerce'].includes(c.type));
  const c0 = chs().find((c) => c.type === 'trendyol') || chs()[0] || {};
  const f = { channel: c0.id || '', kind: defKind(c0.type), show: 'all', q: '' };
  let data = null;
  const busyKeys = new Set();
  const isChosen = (o) => o.chosen_price > 0;
  const hasLoss = (o) => o.tiers.some((t) => t.loss);
  const list = () => (data ? data.offers.filter((o) => (f.show === 'all' || (f.show === 'chosen' ? isChosen(o) : f.show === 'loss' ? hasLoss(o) : !o.remote_id))
    && (!f.q || `${o.name} ${o.sku || ''} ${o.barcode || ''}`.toLocaleLowerCase('tr').includes(f.q.toLocaleLowerCase('tr')))) : []);

  function draw() {
    const c = ch(f.channel), rows = list(), offers = data ? data.offers : [], file = data && data.file;
    const tierNames = offers.reduce((a, o) => (o.tiers.length > a.length ? o.tiers.map((t) => t.label) : a), []);
    const groups = data ? data.groups : [], chosen = offers.filter(isChosen);
    const lossChosen = chosen.filter((o) => o.chosen && o.chosen.loss).length;
    render(el, html`<div class="stack">
      <div class="notice small" data-clamp="1"><i class="ico ico-help"></i><div><b>Nasıl çalışır?</b>
        <ol style="margin:6px 0 0;padding-left:18px;line-height:1.55">
          <li>Pazaryeri panelinden avantajlı etiket / flaş indirim listesini Excel olarak indirin.</li>
          <li>Buraya yükleyin: her eşik fiyatında kârınızı görün (komisyon, kargo, stopaj ve alış fiyatı düşülmüş, KDV dahil).</li>
          <li>Her ürün için eşiği ya da kendi fiyatınızı seçin; zarar ettiren fiyatlar kırmızıdır.</li>
          <li><b>"Excel'i indir"</b> düğmesine basın: dosyanız aynı düzende, seçtiğiniz fiyatlarla iner — pazaryerine olduğu gibi yükleyin.</li>
        </ol></div></div>
      ${groups.length ? html`<div class="row wrap" style="gap:8px">${groups.map((g) => html`<button class="chip ${g.channel === f.channel && g.kind === f.kind ? 'on' : ''}" data-act="group" data-ch="${g.channel}" data-k="${g.kind}">${chLogo(g.channel, true)} ${ch(g.channel).name} · ${kindName(g.kind)} <b class="num">${n(g.n)}</b>${g.chosen ? html` <span class="tiny">· ${n(g.chosen)} seçili</span>` : ''}</button>`)}</div>` : ''}
      <div class="card stack">
        <div class="row wrap" style="gap:10px;align-items:flex-end">
          <label class="field" style="min-width:170px"><span>Kanal</span><select class="input" data-f="channel">${chs().map((x) => html`<option value="${x.id}" ${x.id === f.channel ? 'selected' : ''}>${x.name}</option>`)}</select></label>
          <label class="field" style="min-width:190px"><span>Kampanya türü</span><select class="input" data-f="kind">${KINDS.map(([k, t]) => html`<option value="${k}" ${k === f.kind ? 'selected' : ''}>${t}</option>`)}</select></label>
          <label class="btn ${offers.length ? '' : 'primary'}" style="cursor:pointer"><i class="ico ico-upload"></i>Excel / CSV yükle<input type="file" accept=".xlsx,.csv,.txt" data-file hidden></label>
          ${state.demo && ['trendyol', 'hepsiburada'].includes(c.type) ? html`<button class="btn ghost" data-act="sample"><i class="ico ico-download"></i>Örnek Excel indir</button>` : ''}
          ${offers.length ? html`<button class="btn ghost" data-act="clear"><i class="ico ico-x"></i>Listeyi sil</button>` : ''}
        </div>
        <div class="muted small">${WHERE[c.type] ? raw(WHERE[c.type]) : 'Pazaryeri panelinden indirdiğiniz kampanya / davet listesi.'} Barkod, stok kodu ya da kanal ürün kodu sütunu ve en az bir eşik / kampanya fiyatı sütunu yeterli; sütun adları kendiliğinden tanınır.
          ${state.demo ? html` <b>Demo:</b> örnek liste hazır yüklü; "Örnek Excel indir" ile dosyayı indirip yeniden yükleyerek akışı baştan deneyebilirsiniz.` : ''}</div>
      </div>
      ${!data ? html`<div class="card empty"><i class="ico ico-sync spin"></i></div>` : !offers.length ? html`<div class="card empty">Bu kanal ve tür için yüklenmiş liste yok</div>` : html`
      <div class="card stack" data-bar>
        <div class="row wrap" style="gap:10px;align-items:center">
          <b>${n(chosen.length)} üründe yeni fiyat seçildi</b>${lossChosen ? html`<span class="pill bad tiny">${n(lossChosen)} tanesi zararına</span>` : ''}
          <span style="flex:1"></span>
          <button class="btn primary" data-act="download" ${chosen.length ? '' : 'disabled'}><i class="ico ico-download"></i>Excel'i indir</button>
          ${c.type === 'trendyol' ? html`<button class="btn" data-act="tylist" ${chosen.length ? '' : 'disabled'} title="Trendyol → Ürünler → Toplu Ürün İşlemleri → Stok &amp; Fiyat Güncelle için barkod + yeni fiyat listesi"><i class="ico ico-download"></i>Fiyat güncelleme listesi</button>` : ''}
          <button class="btn ghost" data-act="apply" ${chosen.some((o) => o.remote_id) ? '' : 'disabled'} title="İsteğe bağlı: Excel yerine seçilen fiyatları doğrudan ${c.name || 'kanal'} fiyatı yapıp gönderir"><i class="ico ico-check"></i>Kanala gönder</button>
        </div>
        ${file ? html`<div class="tiny muted">${file.name}${file.uploaded_at ? ` · ${ago(file.uploaded_at)} yüklendi` : ''} ·
          ${file.target && file.target.append ? html`<span class="warn-t">Dosyada yeni fiyatın yazılacağı sütun bulunamadı; seçilen fiyatlar en sağa eklenen <b>"${file.target.header}"</b> sütununa yazılır. Pazaryerine yüklerken bu sütunu kullanın${c.type === 'trendyol' ? ' ya da "Fiyat güncelleme listesi"ni Stok & Fiyat Güncelle ile yükleyin' : ''}.</span>`
            : file.target ? html`Seçilen fiyatlar dosyanızdaki <b>"${file.target.header}"</b> sütununa yazılır${file.join ? html`, <b>"${file.join.header}"</b> sütununa "Evet"` : ''}; seçilmeyen satırlar olduğu gibi kalır.` : ''}</div>` : ''}
        <div class="row wrap small" style="gap:8px;align-items:center">
          <span class="muted">Hepsine:</span>
          <select class="input" style="width:auto" data-tier>${tierNames.map((t, i) => html`<option value="t${i}">${t}</option>`)}</select>
          <button class="btn sm" data-act="bulk">Seç (zarar edenler hariç)</button>
          <button class="btn sm ghost" data-act="reset" ${chosen.length ? '' : 'disabled'}>Seçimleri temizle</button>
        </div>
      </div>
      <div class="row wrap"><div class="tabs" style="flex:1;min-width:0">${[['all', 'Tümü', offers.length], ['chosen', 'Fiyat seçilen', chosen.length], ['loss', 'Zarar eden eşik', offers.filter(hasLoss).length], ['nomatch', 'Eşleşmeyen', offers.filter((o) => !o.remote_id).length]]
        .map(([k, t, cnt]) => html`<button class="tab ${f.show === k ? 'on' : ''}" data-act="show" data-k="${k}">${t} <span class="muted">${n(cnt)}</span></button>`)}</div>
        <div class="search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ürün, barkod, stok kodu" data-q value="${f.q}"></div></div>
      <div class="card flush"><div class="table-wrap"><table class="t"><thead><tr><th>Ürün</th><th class="r">Şu anki fiyat</th>${tierNames.map((t) => html`<th class="r">${t}</th>`)}<th class="r">Kendi fiyatınız</th></tr></thead><tbody>
        ${rows.slice(0, 500).map((o) => html`<tr data-key="${o.key}" class="${isChosen(o) ? 'sel-row' : ''}">
          <td><div class="row" style="gap:10px;min-width:220px">${thumb(o.image, o.name, 'sm')}<div style="min-width:0"><div class="ellipsis" style="font-weight:650;max-width:340px">${o.name}${o.variant ? html` <span class="muted">· ${o.variant}</span>` : ''}</div>
            <div class="tiny muted">${[o.sku, o.barcode].filter(Boolean).join(' · ')}${o.stock != null ? ` · stok ${n(o.stock)}` : ''}${o.ends_at ? ` · bitiş ${date(o.ends_at)}` : ''}</div>
            ${!o.remote_id ? html`<span class="pill warn tiny" title="Panelde bu kanalda eşleşen ilan yok; kâr hesaplanamaz ama Excel'e yine yazılabilir">İlan bulunamadı</span>` : ''}${o.applied_at ? html`<span class="pill info tiny" title="${ago(o.applied_at)}">${money(o.applied_price)} kanala gönderildi${o.pending ? ' · sırada' : ''}</span>` : ''}</div></div></td>
          <td class="r"><button class="tierbtn ${!o.choice ? 'cur' : ''}" data-act="pick" data-c="" title="Fiyatı değiştirme"><span class="num">${o.price ? money(o.price) : '—'}</span><br>${marg(o.now)}</button></td>
          ${tierNames.map((_, i) => { const t = o.tiers[i]; return html`<td class="r">${t ? html`<button class="tierbtn ${o.choice === `t${i}` ? 'sel' : ''} ${t.loss ? 'loss' : ''} ${t.ok ? 'ok' : ''}" data-act="pick" data-c="t${i}" title="${t.loss ? 'Bu fiyatta zarar edersiniz' : t.ok ? 'Şu anki fiyatınız bu eşiği zaten sağlıyor' : 'Bu fiyatı seç'}">
            <span class="num">${money(t.price)}</span>${t.ok ? html`<i class="ico ico-check"></i>` : ''}<br>${marg(t)}</button>` : html`<span class="muted">—</span>`}</td>`; })}
          <td class="r"><input class="input qty-in ${o.choice === 'custom' ? 'sel' : ''}" style="width:96px;text-align:right" inputmode="decimal" placeholder="₺" data-custom value="${o.choice === 'custom' ? String(o.chosen_price).replace('.', ',') : ''}">
            ${o.choice === 'custom' ? html`<div>${marg(o.chosen)}</div>` : ''}</td></tr>`)}
      </tbody></table></div>${rows.length > 500 ? html`<div class="muted small" style="padding:10px 14px">İlk 500 ürün gösteriliyor; aramayla daraltın. Excel'e tüm seçimler yazılır.</div>` : ''}</div>`}
    </div>`);
  }
  async function load() { data = null; draw(); data = await api(`promos?channel=${encodeURIComponent(f.channel)}&kind=${f.kind}`, { fresh: true }).catch((e) => ({ offers: [], groups: [], error: e.message })); if (data.error) toast(data.error, true); draw(); }
  // Seçimleri sunucuya yaz, yerelde kârı yeniden hesapla
  async function choose(items) {
    const r = await api('promos/choose', { method: 'POST', body: { channel: f.channel, kind: f.kind, items } });
    if (r.bad && items.length === 1) toast('Geçerli bir fiyat girin', true);
    const by = new Map(r.items.map((x) => [x.key, x]));
    for (const o of data.offers) {
      const x = by.get(o.key);
      if (!x) continue;
      o.choice = x.choice || null;
      o.chosen_price = x.price || null;
      o.chosen = o.chosen_price ? calc(o.calc, o.chosen_price, o.calc && o.calc.tierRate) : null;
    }
    const g = data.groups.find((x) => x.channel === f.channel && x.kind === f.kind);
    if (g) g.chosen = data.offers.filter(isChosen).length;
    draw();
  }

  // ---- Excel'i indir: yüklenen dosya aynı düzende, seçilen fiyatlar hedef sütunda ----
  async function download() {
    const fx = await api(`promos/file?channel=${encodeURIComponent(f.channel)}&kind=${f.kind}`, { fresh: true });
    const meta = fx.meta;
    if (!meta) { toast('Dosya bilgisi bulunamadı; Excel\'i yeniden yükleyin', true); return; }
    const chosen = data.offers.filter((o) => isChosen(o) && o.row);
    const val = (p) => (meta.textPrices ? p.toFixed(2).replace('.', ',') : p);
    const t = meta.target, j = meta.join;
    const name = outName(meta.name, meta.type === 'csv' ? 'csv' : 'xlsx');
    if (fx.data && meta.type === 'xlsx') {
      const cells = chosen.map((o) => ({ r: o.row, c: t.index, v: val(o.chosen_price) }));
      if (j) for (const o of chosen) cells.push({ r: o.row, c: j.index, v: 'Evet' });
      if (t.append) cells.push({ r: meta.headerRow, c: t.index, v: t.header });
      saveFile(await patchXlsx(unb64(fx.data), cells, { headerRow: meta.headerRow }), name);
    } else if (fx.data) {
      const rows = csvRows(new TextDecoder().decode(unb64(fx.data)));
      const set = (r, c, v) => { const row = rows[r - 1] || (rows[r - 1] = []); while (row.length < c) row.push(''); row[c] = v; };
      for (const o of chosen) { set(o.row, t.index, val(o.chosen_price)); if (j) set(o.row, j.index, 'Evet'); }
      if (t.append) set(meta.headerRow, t.index, t.header);
      saveFile(buildCsv(rows.map((r) => Array.from(r, (x) => x ?? '')), meta.sep || ';'), name, 'text/csv;charset=utf-8');
    } else {
      // Dosya saklanmamış (çok büyük ya da demo örneği): aynı başlık ve satırlarla yeniden kurulur
      const by = new Map(chosen.map((o) => [o.row, o]));
      const head = t.append ? [...meta.head, t.header] : [...meta.head];
      const out = [head, ...(fx.rows || []).map(([r, cells]) => {
        const row = [...cells];
        const o = by.get(r);
        if (o) { row[t.index] = val(o.chosen_price); if (j) row[j.index] = 'Evet'; }
        return row;
      })];
      saveFile(meta.type === 'csv' ? buildCsv(out, meta.sep || ';') : await buildXlsx(out), name, meta.type === 'csv' ? 'text/csv;charset=utf-8' : XLSX_TYPE);
    }
    toast(`${n(chosen.length)} ürünün fiyatı "${t.header}" sütununa yazıldı · ${name}`);
  }

  el.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.dataset.f) { f[t.dataset.f] = t.value; if (t.dataset.f === 'channel') f.kind = defKind(ch(t.value).type); load(); return; }
    if (t.matches('[data-custom]')) {
      const k = t.closest('[data-key]').dataset.key, v = t.value.trim();
      await busy(null, () => choose([{ key: k, choice: v ? 'custom' : null, price: v }]));
      return;
    }
    if (t.matches('[data-file]') && t.files[0]) {
      const file = t.files[0];
      await busy(null, async () => {
        const buf = new Uint8Array(await file.arrayBuffer());
        const g = await readGrid(buf);
        if (!g.rows.length) { toast('Dosyada satır bulunamadı', true); return; }
        const grid = g.rows.map((r) => [r.r, r.cells, r.types.map((x) => x || ' ').join('')]);
        const r = await api('promos/import', { method: 'POST', body: { channel: f.channel, kind: f.kind, name: file.name, type: g.type, sep: g.sep, grid, file: buf.length <= 6e6 ? b64(buf) : null } });
        toast(`${n(r.imported)} ürün yüklendi · ${n(r.matched)} ilanla eşleşti · eşikler: ${r.tiers.join(', ')}`);
        f.show = 'all';
        await load();
      });
      t.value = '';
    }
  });
  el.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { f.q = e.target.value; clearTimeout(el._q); el._q = setTimeout(() => { draw(); const q = $('[data-q]', el); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250); } });
  actions(el, {
    group: (t) => { f.channel = t.dataset.ch; f.kind = t.dataset.k; load(); },
    show: (t) => { f.show = t.dataset.k; draw(); },
    pick: async (t) => {
      const k = t.closest('[data-key]').dataset.key, o = data.offers.find((x) => x.key === k);
      if (!o || busyKeys.has(k)) return;
      const c = t.dataset.c && o.choice !== t.dataset.c ? t.dataset.c : null; // aynı eşiğe yeniden basınca seçim kalkar
      busyKeys.add(k);
      try { await busy(null, () => choose([{ key: k, choice: c }])); } finally { busyKeys.delete(k); }
    },
    bulk: (t) => busy(t, async () => {
      const c = $('[data-tier]', el).value, i = Number(c.slice(1));
      const items = list().filter((o) => o.tiers[i] && !o.tiers[i].loss).map((o) => ({ key: o.key, choice: c }));
      if (!items.length) { toast('Seçilebilecek ürün yok (eşik yok ya da zararına)', true); return; }
      await choose(items);
      toast(`${n(items.length)} üründe ${o0(c)} seçildi`);
    }),
    reset: async (t) => {
      if (!(await confirmBox('Tüm fiyat seçimleri temizlensin mi?', 'Temizle'))) return;
      busy(t, () => choose(data.offers.filter(isChosen).map((o) => ({ key: o.key, choice: null }))));
    },
    download: (t) => busy(t, download),
    tylist: (t) => busy(t, async () => {
      const chosen = data.offers.filter((o) => isChosen(o) && o.barcode);
      const val = (p) => Math.round(p * 100) / 100;
      // Trendyol'da satış fiyatı piyasa fiyatını geçemez: liste fiyatı düşük kalan üründe piyasa fiyatı da yazılır
      const rows = [['Barkod', 'Piyasa Satış Fiyatı', 'Trendyol\'da Satılacak Fiyat', 'Ürün Stok Adedi'], ...chosen.map((o) => [String(o.barcode), (o.list_price || 0) < o.chosen_price ? val(o.chosen_price) : '', val(o.chosen_price), ''])];
      saveFile(await buildXlsx(rows, { sheetName: 'Fiyat' }), `trendyol-fiyat-guncelleme-hasturk.xlsx`);
      toast(`${n(chosen.length)} ürün · Trendyol → Ürünler → Toplu Ürün İşlemleri → Stok & Fiyat Güncelle ile yükleyin`);
    }),
    sample: (t) => busy(t, async () => {
      const s = await api(`promos/sample?channel=${encodeURIComponent(f.channel)}`, { fresh: true });
      saveFile(await buildXlsx([s.head, ...s.rows]), s.name);
      toast('Örnek Excel indirildi; "Excel / CSV yükle" ile yükleyip deneyin');
    }),
    apply: async (t) => {
      const keys = data.offers.filter((o) => isChosen(o) && o.remote_id).map((o) => o.key);
      const loss = data.offers.filter((o) => isChosen(o) && o.remote_id && o.chosen && o.chosen.loss).length;
      if (!keys.length || !(await confirmBox(`${n(keys.length)} ürünün seçilen fiyatı ${ch(f.channel).name} fiyatı olsun ve kanala gönderilsin mi?${loss ? ` Zararına olan ${n(loss)} ürün atlanır.` : ''} (Excel'le yükleyecekseniz buna gerek yok.)`, 'Gönder'))) return;
      busy(t, async () => {
        const r = await api('promos/apply', { method: 'POST', body: { channel: f.channel, kind: f.kind, keys } });
        toast(`${n(r.applied)} ilanın fiyatı güncellendi, kanala gönderiliyor${r.loss ? ` · ${n(r.loss)} zararına ürün atlandı` : ''}${r.unmatched ? ` · ${n(r.unmatched)} eşleşmedi` : ''}`, !r.applied);
        await load();
      });
    },
    clear: async (t) => {
      if (!(await confirmBox(`${ch(f.channel).name} · ${kindName(f.kind)} listesi silinsin mi? (Kanala gönderilmiş fiyatlar değişmez)`, 'Sil'))) return;
      busy(t, async () => { await api('promos/clear', { method: 'POST', body: { channel: f.channel, kind: f.kind } }); toast('Liste silindi'); await load(); });
    },
  });
  const o0 = (c) => { const i = Number(c.slice(1)), o = data.offers.find((x) => x.tiers[i]); return o ? `"${o.tiers[i].label}"` : 'eşik'; };
  await load();
  return { refresh: load };
}
