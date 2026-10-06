// Kampanyalar: (1) Fiyat önerileri — pazaryerinin rakip (buybox) fiyatlarından birinciliği alma / kâr artırma önerileri (bkz. suggest.js);
// (2) Hepsiburada satıcı sepet indirimleri (yüzde, TL, X al Y öde) panelden listelenir, oluşturulur ve iptal edilir.
import { api, html, render, $, $$, n, money0, date, ch, chLogo, actions, busy, toast, sheet, confirmBox, activeChannels } from '../core.js';
import { suggestView } from './suggest.js';

export const campaignChannels = () => activeChannels().filter((c) => (c.enabled || c.demo) && c.campaigns);
const KIND = [['percent', 'Sepette % indirim'], ['tl', 'Sepette TL indirim'], ['xy', 'X al Y öde']];
const dayIn = (d) => { const x = new Date(Date.now() + 3 * 3600e3 + d * 864e5); return x.toISOString().slice(0, 16); };

export async function campaignsView(el) {
  let tab = 'suggest', cur = null;
  try { tab = sessionStorage.getItem('camp_tab') === 'basket' ? 'basket' : 'suggest'; } catch { /* yok */ }
  async function show() {
    render(el, html`<div class="stack"><div class="tabs" data-ctabs>${[['suggest', 'Fiyat önerileri'], ['basket', 'Sepet indirimleri']].map(([k, t]) => html`<button class="tab ${tab === k ? 'on' : ''}" data-t="${k}">${t}</button>`)}</div><div data-pane></div></div>`);
    $$('[data-t]', el).forEach((b) => { b.onclick = () => { tab = b.dataset.t; try { sessionStorage.setItem('camp_tab', tab); } catch { /* yok */ } show(); }; });
    cur = await (tab === 'basket' ? basketView : suggestView)($('[data-pane]', el));
  }
  await show();
  return { refresh: () => cur && cur.refresh && cur.refresh() };
}

async function basketView(el) {
  const chs = campaignChannels();
  let chId = chs[0] && chs[0].id, data = null;
  const state = (c) => { const t = Date.now(), s = Date.parse(c.startDate), e = Date.parse(c.endDate); return c.status === 3 || c.status === 'Cancelled' ? ['', 'İptal'] : e < t ? ['', 'Bitti'] : s > t ? ['info', 'Başlayacak'] : ['good', 'Aktif']; };
  function draw() {
    render(el, html`<div class="stack">
      <div class="notice small"><i class="ico ico-tag"></i><div><b>Hepsiburada sepet indirimleri</b> buradan oluşturulup iptal edilir. Rakiplere göre fiyat önerileri için <b>Fiyat önerileri</b> sekmesine bakın.</div></div>
      ${!chs.length ? html`<div class="card empty">Kampanya servisi olan bağlı kanal yok. Hepsiburada bağlanıp bağlantı testi geçince sepet indirimleri buradan yönetilir (Entegrasyonlar).</div>` : html`
      <div class="row wrap">${chs.length > 1 ? html`<div class="ch-tabs" style="flex:1">${chs.map((c) => html`<button class="ch-tab ${chId === c.id ? 'on' : ''}" data-act="ch" data-id="${c.id}">${chLogo(c.id)}${c.name}</button>`)}</div>` : html`<span style="flex:1"></span>`}
        <button class="btn primary" data-act="new"><i class="ico ico-plus"></i>Yeni sepet indirimi</button></div>
      <div class="card flush">${!data ? html`<div class="empty"><i class="ico ico-sync spin"></i></div>` : data.error ? html`<div class="notice bad" style="margin:12px">${data.error}</div>` : data.items.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Kampanya</th><th>Tarih</th><th>Durum</th><th class="r">Kullanım sınırı</th><th></th></tr></thead><tbody>
        ${data.items.map((c) => { const st = state(c); return html`<tr data-id="${c.campaignId}"><td><div style="font-weight:650">${c.name}</div><div class="muted tiny">${c.description || ''}</div></td>
          <td class="small" style="white-space:nowrap">${date(Date.parse(c.startDate))} – ${date(Date.parse(c.endDate))}</td><td><span class="pill ${st[0]}" title="durum kodu ${c.status}">${st[1]}</span></td><td class="r num">${c.limit ? n(c.limit) : '—'}</td>
          <td class="r"><div class="row" style="justify-content:flex-end;gap:6px"><button class="btn sm" data-act="detail">Ayrıntı</button>${st[1] === 'Aktif' || st[1] === 'Başlayacak' ? html`<button class="btn sm ghost" data-act="cancel">İptal et</button>` : ''}</div></td></tr>`; })}
      </tbody></table></div>` : html`<div class="empty">Henüz kampanya yok</div>`}</div>`}
    </div>`);
  }
  async function load() { data = null; draw(); if (!chId) return; data = await api(`campaigns?channel=${chId}`).catch((e) => ({ items: [], error: e.message })); draw(); }

  async function form() {
    const s = sheet({ title: `Yeni sepet indirimi · ${ch(chId).name}`, size: 'narrow', body: html`<div class="empty"><i class="ico ico-sync spin"></i></div>` });
    const meta = await api(`campaigns/meta?channel=${chId}`).catch(() => ({ budgets: [], limits: null, categories: [] }));
    const lims = (meta.limits && meta.limits.limits) || [];
    s.setBody(html`<form class="stack" data-f>
      <label class="field"><span>Tür</span><select class="input" name="kind">${KIND.map(([k, t]) => html`<option value="${k}">${t}</option>`)}</select></label>
      <label class="field"><span>Kampanya adı</span><input class="input" name="name" required maxlength="80" placeholder="ör. 500 TL üzeri %10"></label>
      <div class="form-grid"><label class="field"><span>Başlangıç</span><input class="input" type="datetime-local" name="startDate" value="${dayIn(0)}" required></label>
        <label class="field"><span>Bitiş</span><input class="input" type="datetime-local" name="endDate" value="${dayIn(7)}" required></label></div>
      <label class="field"><span>Kapsam</span><select class="input" name="scope"><option value="all">Tüm ürünlerim</option><option value="cat">Seçili kategoriler</option><option value="sku">Seçili ürünler (SKU)</option></select></label>
      <div data-scope="cat" hidden class="stack" style="gap:4px;max-height:180px;overflow:auto">${meta.categories.map((c) => html`<label class="check"><input type="checkbox" data-cat="${c.id}"> ${c.name}</label>`)}${!meta.categories.length ? html`<span class="muted small">Kategori listesi alınamadı</span>` : ''}</div>
      <label class="field" data-scope="sku" hidden><span>Hepsiburada SKU'ları (virgül ya da satır ile)</span><textarea class="input" name="skus" rows="3"></textarea></label>
      <div class="form-grid" data-kind="percent">
        <label class="field"><span>İndirim %</span><input class="input" name="discountPercentage" inputmode="numeric" value="10"></label>
        <label class="field"><span>Sepet alt sınırı ₺</span><input class="input" name="conditionAmount" inputmode="numeric" value="${lims[0] ? lims[0].lowerLimit : 250}"></label>
        <label class="field"><span>En fazla indirim ₺</span><input class="input" name="maxDiscountAmount" inputmode="numeric" value="100"></label>
        <label class="field"><span>En fazla sepet sayısı</span><input class="input" name="maxCartCount" inputmode="numeric" value="100"></label></div>
      <div class="form-grid" data-kind="tl" hidden>
        <label class="field"><span>Bütçe ₺</span><select class="input" name="budget">${(meta.budgets.length ? meta.budgets : [1000]).map((b) => html`<option value="${b}">${money0(b)}</option>`)}</select></label>
        <label class="field"><span>Sepet alt sınırı / indirim</span><select class="input" name="tlpair">${lims.flatMap((l) => l.campaignAmounts.map((a) => html`<option value="${l.lowerLimit}|${a}">${money0(l.lowerLimit)} üzeri ${money0(a)} indirim</option>`))}${!lims.length ? html`<option value="250|25">₺250 üzeri ₺25 indirim</option>` : ''}</select></label></div>
      <div class="form-grid" data-kind="xy" hidden>
        <label class="field"><span>Alınan adet (X)</span><input class="input" name="conditionProductCount" inputmode="numeric" value="3"></label>
        <label class="field"><span>Ödenen adet (Y)</span><input class="input" name="mustPayProductCount" inputmode="numeric" value="2"></label>
        <label class="field"><span>Sepette tekrar sayısı</span><input class="input" name="iterationCount" inputmode="numeric" value="1"></label>
        <label class="field"><span>En fazla sepet sayısı</span><input class="input" name="maxCartCount2" inputmode="numeric" value="100"></label></div>
      <label class="check"><input type="checkbox" name="oneTimeUsage"> Müşteri başına bir kez kullanılabilir</label>
      <div class="muted tiny">Kampanya doğrudan Hepsiburada'da oluşturulur; indirim tutarını Hepsiburada'nın izin verdiği sınırlar içinde seçin.</div></form>`);
    s.setFoot(html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-x="save">Kampanyayı oluştur</button>`);
    const fm = $('[data-f]', s.el);
    const sync = () => { $$('[data-kind]', s.el).forEach((x) => { x.hidden = x.dataset.kind !== fm.kind.value; }); $$('[data-scope]', s.el).forEach((x) => { x.hidden = x.dataset.scope !== fm.scope.value; }); };
    fm.addEventListener('change', sync); sync();
    s.el.addEventListener('click', (e) => { const b = e.target.closest('[data-x=save]'); if (!b) return; busy(b, async () => {
      if (!fm.reportValidity()) return;
      const v = (k) => (fm[k] ? fm[k].value : ''), kind = v('kind');
      const body = { channel: chId, kind, name: v('name').trim(), startDate: new Date(v('startDate')).toISOString(), endDate: new Date(v('endDate')).toISOString(), oneTimeUsage: fm.oneTimeUsage.checked,
        categories: v('scope') === 'cat' ? $$('[data-cat]', s.el).filter((x) => x.checked).map((x) => x.dataset.cat) : [], skus: v('scope') === 'sku' ? v('skus').split(/[\s,;]+/).filter(Boolean) : [] };
      if (kind === 'percent') Object.assign(body, { discountPercentage: v('discountPercentage'), conditionAmount: v('conditionAmount'), maxDiscountAmount: v('maxDiscountAmount'), maxCartCount: v('maxCartCount') });
      if (kind === 'tl') { const [c, a] = v('tlpair').split('|'); Object.assign(body, { budget: v('budget'), conditionAmount: c, discountAmount: a }); }
      if (kind === 'xy') Object.assign(body, { conditionProductCount: v('conditionProductCount'), mustPayProductCount: v('mustPayProductCount'), iterationCount: v('iterationCount'), maxCartCount: v('maxCartCount2') });
      await api('campaigns', { method: 'POST', body });
      s.close(); toast('Kampanya oluşturuldu'); await load();
    }); });
  }
  actions(el, {
    ch: (t) => { chId = t.dataset.id; load(); },
    new: () => form(),
    detail: (t) => busy(t, async () => {
      const d = await api(`campaigns/${t.closest('[data-id]').dataset.id}?channel=${chId}`);
      const rows = Object.entries(d || {}).filter(([, v]) => v != null && typeof v !== 'object');
      sheet({ title: d.name || 'Kampanya', size: 'narrow', body: html`<dl class="kv small">${rows.map(([k, v]) => html`<dt>${k}</dt><dd>${String(v)}</dd>`)}</dl>` });
    }),
    cancel: async (t) => {
      if (!(await confirmBox('Kampanya Hepsiburada\'da iptal edilsin mi?', 'İptal et'))) return;
      busy(t, async () => { await api(`campaigns/${t.closest('[data-id]').dataset.id}/cancel`, { method: 'POST', body: { channel: chId } }); toast('Kampanya iptal edildi'); await load(); });
    },
  });
  await load();
  return { refresh: load };
}
