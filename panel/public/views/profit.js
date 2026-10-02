// Kâr hesaplayıcı: alış, satış, komisyon, kargo → satıştan kalan ve ürün başı kâr. Telefonda tek elle kullanılabilir.
// Hesap tarayıcıda yapılır (internet gerekmez); son girilen değerler hatırlanır.
import { api, state, html, render, $, $$, money, n, ch, chColor, store, debounce, numIn } from '../core.js';
import { profit, priceFor } from '../profit.js';

const DEF = { sale: '', purchase: '', commissionRate: '', shipping: '', fee: '', extra: '', vatRate: 20, includeVat: false, qty: 1, target: 20, channel: '' };

export async function profitView(el) {
  const v = { ...DEF, ...store.get('calc', {}) };
  const st = state.settings || {};
  const field = (k, label, suffix = '₺', hint = '') => html`<label class="field"><span>${label}</span><div class="input-group"><input class="input big num" inputmode="decimal" enterkeyhint="next" data-k="${k}" value="${v[k]}" placeholder="0"><span class="suffix">${suffix}</span></div>${hint ? html`<small class="muted tiny">${hint}</small>` : ''}</label>`;
  render(el, html`<div class="two-col">
    <div class="stack">
      <div class="card stack">
        <div class="row"><h2 style="flex:1">Kâr hesapla</h2><button class="btn sm ghost" data-act="clear">Temizle</button></div>
        <div class="search" style="min-width:0"><i class="ico ico-search"></i><input class="input" placeholder="Üründen doldur (ad / SKU)" data-find></div>
        <div class="list" data-found></div>
        <div class="grid" style="grid-template-columns:1fr 1fr">${field('sale', 'Satış fiyatı')}${field('purchase', 'Alış fiyatı')}</div>
        <div>
          ${field('commissionRate', 'Komisyon', '%')}
          <div class="preset">${state.channels.map((c) => html`<button class="chip ${v.channel === c.id ? 'on' : ''}" data-ch="${c.id}"><span class="dot" style="background:${chColor(c.id)}"></span>${c.short} %${n((st.commission || {})[c.id] || 0)}</button>`)}</div>
        </div>
        <div class="grid" style="grid-template-columns:1fr 1fr">${field('shipping', 'Kargo gideri')}${field('fee', 'Hizmet / işlem bedeli')}</div>
        <div class="grid" style="grid-template-columns:1fr 1fr">${field('extra', 'Diğer gider', '₺', 'paketleme, reklam…')}${field('qty', 'Adet', 'ad')}</div>
        <div class="row wrap">
          <label class="check" style="flex:1"><span class="switch"><input type="checkbox" data-k="includeVat" ${v.includeVat ? 'checked' : ''}><span></span></span> KDV'yi hesaba kat</label>
          <label class="row small">Ürün KDV <select class="input" style="width:auto;min-height:36px" data-k="vatRate">${[0, 1, 10, 20].map((x) => html`<option value="${x}" ${Number(v.vatRate) === x ? 'selected' : ''}>%${x}</option>`)}</select></label>
        </div>
        <p class="muted tiny" style="margin:0">Tüm tutarlar KDV dahil girilir. “KDV'yi hesaba kat” açıkken satıştan doğan KDV'den alış, komisyon, kargo ve giderlerin KDV'si (%20) düşülür; kalan ödenecek KDV kârdan çıkarılır.</p>
      </div>
      <div class="card flush" data-compare></div>
    </div>
    <div class="stack sticky" data-result></div>
  </div>`);

  const calc = () => {
    const inp = { sale: numIn(v.sale), purchase: numIn(v.purchase), commissionRate: numIn(v.commissionRate), shipping: numIn(v.shipping), fee: numIn(v.fee), extra: numIn(v.extra), vatRate: Number(v.vatRate), includeVat: !!v.includeVat, qty: numIn(v.qty) || 1 };
    const r = profit(inp);
    const target = priceFor(inp, numIn(v.target));
    const good = r.unitProfit >= 0;
    render($('[data-result]', el), html`<div class="card stack">
      <div><div class="muted small">Satıştan kalan (hakediş)</div><div class="res-big num">${money(r.payout)}</div><div class="muted tiny">satış − komisyon − kargo − hizmet bedeli</div></div>
      <div style="padding:14px;border-radius:12px;background:${good ? 'var(--good-soft)' : 'var(--bad-soft)'}">
        <div class="small" style="font-weight:600">Ürün başına kâr</div>
        <div class="res-big num" style="color:${good ? 'var(--good)' : 'var(--bad)'}">${money(r.unitProfit)}</div>
        ${r.qty > 1 ? html`<div class="small">${r.qty} adet için toplam <b class="num">${money(r.totalProfit)}</b></div>` : ''}
      </div>
      <div class="res-grid">
        <div class="res-box"><div class="label">Kâr oranı (satışa göre)</div><div class="v num">%${n(r.margin)}</div></div>
        <div class="res-box"><div class="label">Alışa göre kâr</div><div class="v num">${inp.purchase ? `%${n(r.markup)}` : '—'}</div></div>
        <div class="res-box"><div class="label">Komisyon tutarı</div><div class="v num">${money(r.commission)}</div></div>
        <div class="res-box"><div class="label">Başabaş satış fiyatı</div><div class="v num">${r.breakEven != null ? money(r.breakEven) : '—'}</div></div>
      </div>
      ${inp.includeVat ? html`<dl class="kv small"><dt>Satış KDV'si</dt><dd>${money(r.vat.sale)}</dd><dt>İndirilecek KDV (alış)</dt><dd>−${money(r.vat.purchase)}</dd><dt>İndirilecek KDV (hizmetler)</dt><dd>−${money(r.vat.services)}</dd><div class="total" style="display:contents"><dt>${r.vat.payable >= 0 ? 'Ödenecek KDV' : 'Devreden KDV'}</dt><dd>${money(Math.abs(r.vat.payable))}</dd></div></dl>` : ''}
      <div class="stack" style="border-top:1px solid var(--line);padding-top:12px">
        <div class="row"><span class="small" style="flex:1;font-weight:600">Hedef kâr oranı</span><b class="num">%${n(numIn(v.target))}</b></div>
        <input type="range" min="0" max="60" step="1" value="${numIn(v.target)}" data-k="target" aria-label="Hedef kâr oranı">
        <div class="row"><span class="muted small" style="flex:1">Bu oran için satış fiyatı</span><b class="num" style="font-size:18px">${target != null ? money(target) : 'mümkün değil'}</b></div>
      </div>
    </div>`);
    // Aynı ürün, tüm kanallarda (kanalın varsayılan komisyon/kargo/hizmet bedeliyle)
    render($('[data-compare]', el), html`<div style="padding:14px 16px 4px"><h3>Kanallara göre</h3><p class="muted tiny" style="margin:4px 0 0">Aynı satış ve alış fiyatıyla, her kanalın Ayarlar'daki varsayılan komisyon, kargo ve hizmet bedeli kullanılır.</p></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Kanal</th><th class="r">Kom.</th><th class="r">Kalan</th><th class="r">Kâr</th></tr></thead><tbody>
      ${state.channels.map((c) => { const x = profit({ ...inp, commissionRate: (st.commission || {})[c.id] || 0, shipping: (st.shipping || {})[c.id] || 0, fee: (st.service_fee || {})[c.id] || 0 }); return html`<tr>
        <td><span class="ch-badge"><span class="dot" style="background:${chColor(c.id)}"></span>${c.name}</span></td><td class="r num">%${n((st.commission || {})[c.id] || 0)}</td>
        <td class="r num">${money(x.payout)}</td><td class="r num" style="font-weight:700;color:${x.unitProfit >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(x.unitProfit)}</td></tr>`; })}
      </tbody></table></div>`);
    store.set('calc', v);
  };

  el.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    v[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (k === 'commissionRate') { v.channel = ''; $$('[data-ch]', el).forEach((b) => b.classList.remove('on')); }
    calc();
  });
  el.addEventListener('change', (e) => { const k = e.target.dataset.k; if (k === 'vatRate' || k === 'includeVat') { v[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; calc(); } });
  el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-ch]');
    if (c) {
      const id = c.dataset.ch;
      v.channel = id;
      v.commissionRate = String((st.commission || {})[id] || 0);
      if ((st.shipping || {})[id]) v.shipping = String(st.shipping[id]);
      if ((st.service_fee || {})[id]) v.fee = String(st.service_fee[id]);
      for (const k of ['commissionRate', 'shipping', 'fee']) $(`[data-k=${k}]`, el).value = v[k];
      $$('[data-ch]', el).forEach((b) => b.classList.toggle('on', b === c));
      calc();
    }
    if (e.target.closest('[data-act=clear]')) {
      Object.assign(v, DEF);
      $$('input[data-k]', el).forEach((i) => { if (i.type === 'checkbox') i.checked = false; else if (i.type !== 'range') i.value = v[i.dataset.k] ?? ''; });
      $$('[data-ch]', el).forEach((b) => b.classList.remove('on'));
      calc();
    }
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const p = JSON.parse(pick.dataset.pick);
      v.sale = String(p.sale_price || ''); v.purchase = String(p.purchase_price || ''); v.vatRate = p.vat ?? 20;
      $('[data-k=sale]', el).value = v.sale; $('[data-k=purchase]', el).value = v.purchase; $('[data-k=vatRate]', el).value = String(v.vatRate);
      render($('[data-found]', el), ''); $('[data-find]', el).value = p.name;
      calc();
    }
  });
  $('[data-find]', el).addEventListener('input', debounce(async (e) => {
    const q = e.target.value.trim();
    if (q.length < 2) return render($('[data-found]', el), '');
    const r = await api('products?limit=5&q=' + encodeURIComponent(q)).catch(() => ({ products: [] }));
    render($('[data-found]', el), html`${r.products.map((p) => html`<button class="btn sm block" style="justify-content:space-between" data-pick="${JSON.stringify({ name: p.name, sale_price: p.sale_price, purchase_price: p.purchase_price, vat: p.vat })}"><span class="ellipsis">${p.name}</span><span class="muted">${money(p.sale_price)}</span></button>`)}`);
  }, 250));
  calc();
}
