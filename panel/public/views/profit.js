// Kârlılık hesapla: alış, satış, komisyon, kargo → satıştan kalan ve ürün başına kazanç. Telefonda tek elle kullanılır;
// hesap tarayıcıda yapılır (internet gerekmez), son girilen değerler hatırlanır.
import { api, state, html, render, $, $$, money, n, chLogo, store, debounce, numIn , activeChannels } from '../core.js';
import { profit, priceFor, costOf, costRaw, costVat } from '../profit.js';

const DEF = { sale: '', purchase: '', commissionRate: '', shipping: '', fee: '', extra: '', feeRate: '', withholdingRate: '', vatRate: 20, includeVat: false, qty: 1, target: 20, channel: '' };

export async function profitView(el) {
  const v = { ...DEF, ...store.get('calc', {}) };
  const st = state.settings || {}, exv = costVat(st) > 1 ? ' (KDV hariç)' : '';
  const box = (k, label, suffix = '₺', extra = '') => html`<label class="calc-field"><span>${label}</span><div class="input-group"><input class="input big num" inputmode="decimal" enterkeyhint="next" data-k="${k}" value="${v[k]}" placeholder="0"><span class="suffix">${suffix}</span></div>${extra}</label>`;
  render(el, html`<div class="two-col">
    <div class="stack">
      <div class="card stack">
        <div class="row"><div style="flex:1"><h2>Kârlılık hesapla</h2><div class="muted small">Ürün başına kazancını gör</div></div><button class="btn sm ghost" data-act="clear">Temizle</button></div>
        <div class="search" style="min-width:0"><i class="ico ico-search"></i><input class="input" placeholder="Üründen doldur (ad / SKU)" data-find></div>
        <div class="list" data-found></div>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${box('sale', 'Satış fiyatı')}${box('purchase', 'Alış fiyatı')}</div>
        ${box('commissionRate', 'Komisyon' + exv, '%', html`<div class="preset">${activeChannels().map((c) => html`<button class="chip ${v.channel === c.id ? 'on' : ''}" data-ch="${c.id}">${chLogo(c.id, true)}%${n(costRaw(st, 'commission', c.id))}</button>`)}</div>`)}
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${box('shipping', 'Kargo gideri' + exv)}${box('fee', 'Hizmet bedeli' + exv)}</div>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${box('feeRate', 'Ek kesinti' + exv, '%', html`<small class="muted tiny">işlem / ödeme bedeli</small>`)}${box('withholdingRate', 'Stopaj', '%', html`<small class="muted tiny">KDV hariç satıştan, genelde %1</small>`)}</div>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">${box('extra', 'Diğer gider', '₺', html`<small class="muted tiny">paketleme, reklam…</small>`)}${box('qty', 'Adet', 'ad')}</div>
        <div class="row wrap">
          <label class="check" style="flex:1"><span class="switch"><input type="checkbox" data-k="includeVat" ${v.includeVat ? 'checked' : ''}><span></span></span> KDV'yi hesaba kat</label>
          <label class="row small">Ürün KDV <select class="input" style="width:auto;min-height:38px" data-k="vatRate">${[0, 1, 10, 20].map((x) => html`<option value="${x}" ${Number(v.vatRate) === x ? 'selected' : ''}>%${x}</option>`)}</select></label>
        </div>
        <div class="row" style="padding:4px 2px"><span class="muted">Komisyon tutarı</span><span class="spacer"></span><b class="num" style="font-size:18px" data-comm></b></div>
        <button class="btn primary lg block" data-act="go">Hesapla</button>
        <p class="muted tiny" style="margin:0">Tutarlar KDV dahil girilir. “KDV'yi hesaba kat” açıkken satış KDV'sinden alış, komisyon, kargo ve giderlerin KDV'si (%20) düşülür; kalan ödenecek KDV kârdan çıkarılır.</p>
      </div>
    </div>
    <div class="stack sticky" data-result></div>
  </div>`);

  const calc = () => {
    const inp = { sale: numIn(v.sale), purchase: numIn(v.purchase), commissionRate: numIn(v.commissionRate), shipping: numIn(v.shipping), fee: numIn(v.fee), extra: numIn(v.extra), feeRate: numIn(v.feeRate), withholdingRate: numIn(v.withholdingRate), vatRate: Number(v.vatRate), includeVat: !!v.includeVat, qty: numIn(v.qty) || 1 };
    // Komisyon, kargo, hizmet bedeli ve ek kesinti KDV hariç girilir (Ayarlar'daki gibi); hesapta KDV eklenir
    const g = costVat(st), gin = { ...inp, commissionRate: inp.commissionRate * g, shipping: inp.shipping * g, fee: inp.fee * g, feeRate: inp.feeRate * g };
    const r = profit(gin), target = priceFor(gin, numIn(v.target)), good = r.unitProfit >= 0;
    $('[data-comm]', el).textContent = money(r.commission);
    render($('[data-result]', el), html`<div class="card stack">
      <div class="gain" style="background:${good ? 'var(--good-soft)' : 'var(--bad-soft)'}">
        <div class="row" style="justify-content:center;font-weight:700;color:var(--text-2)"><i class="ico ico-bars" style="color:${good ? 'var(--good)' : 'var(--bad)'}"></i>Ürün başına kazanç</div>
        <div class="v num" style="color:${good ? 'var(--good)' : 'var(--bad)'}">${money(r.unitProfit)}</div>
        <div style="font-weight:650;color:${good ? 'var(--good)' : 'var(--bad)'}">Kâr marjı %${n(r.margin)}</div>
        ${r.qty > 1 ? html`<div class="small" style="margin-top:6px">${r.qty} adet için toplam <b class="num">${money(r.totalProfit)}</b></div>` : ''}
      </div>
      <div class="res-grid">
        <div class="res-box"><div class="label">Satıştan kalan (hakediş)</div><div class="v num">${money(r.payout)}</div></div>
        <div class="res-box"><div class="label">Alışa göre kâr</div><div class="v num">${inp.purchase ? `%${n(r.markup)}` : '—'}</div></div>
        <div class="res-box"><div class="label">Komisyon tutarı</div><div class="v num">${money(r.commission)}</div></div>
        <div class="res-box"><div class="label">Başabaş satış fiyatı</div><div class="v num">${r.breakEven != null ? money(r.breakEven) : '—'}</div></div>
      </div>
      <dl class="kv small"><dt>Satış</dt><dd>${money(inp.sale)}</dd><dt>Komisyon</dt><dd>−${money(r.commission)}</dd><dt>Kargo</dt><dd>−${money(gin.shipping)}</dd>
        ${gin.fee ? html`<dt>Hizmet bedeli</dt><dd>−${money(gin.fee)}</dd>` : ''}${r.rateFee ? html`<dt>Ek kesinti</dt><dd>−${money(r.rateFee)}</dd>` : ''}${r.withholding ? html`<dt>Stopaj <span class="tiny muted">(mahsup edilir)</span></dt><dd>−${money(r.withholding)}</dd>` : ''}
        ${g > 1 ? html`<dt class="muted tiny" style="grid-column:1/-1">Kesintilere %20 KDV eklendi (Ayarlar → Komisyon ve giderler)</dt>` : ''}<div class="total"><dt>Hakediş</dt><dd>${money(r.payout)}</dd></div><dt>Alış</dt><dd>−${money(inp.purchase)}</dd>${inp.extra ? html`<dt>Diğer giderler</dt><dd>−${money(inp.extra)}</dd>` : ''}${inp.includeVat ? html`<dt>Ödenecek KDV</dt><dd>−${money(r.vat.payable)}</dd>` : ''}<div class="total"><dt>Kâr</dt><dd>${money(r.unitProfit)}</dd></div></dl>
      ${inp.includeVat ? html`<dl class="kv small"><dt>Satış KDV'si</dt><dd>${money(r.vat.sale)}</dd><dt>İndirilecek KDV (alış)</dt><dd>−${money(r.vat.purchase)}</dd><dt>İndirilecek KDV (hizmetler)</dt><dd>−${money(r.vat.services)}</dd><div class="total"><dt>${r.vat.payable >= 0 ? 'Ödenecek KDV' : 'Devreden KDV'}</dt><dd>${money(Math.abs(r.vat.payable))}</dd></div></dl>` : ''}
      <div class="stack" style="border-top:1px solid var(--line);padding-top:12px">
        <div class="row"><span class="small" style="flex:1;font-weight:650">Hedef kâr oranı</span><b class="num">%${n(numIn(v.target))}</b></div>
        <input type="range" min="0" max="60" step="1" value="${numIn(v.target)}" data-k="target" aria-label="Hedef kâr oranı">
        <div class="row"><span class="muted small" style="flex:1">Bu oran için satış fiyatı</span><b class="num" style="font-size:18px">${target != null ? money(target) : 'mümkün değil'}</b></div>
      </div>
    </div>
    <div class="card flush"><div class="card-pad"><h3>Kanallara göre</h3><div class="muted tiny" style="margin-top:4px">Aynı fiyatlarla, her kanalın Ayarlar'daki komisyon, kargo ve hizmet bedeli kullanılır.</div></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Kanal</th><th class="r">Kom.</th><th class="r">Kalan</th><th class="r">Kâr</th></tr></thead><tbody>
      ${activeChannels().map((c) => { const x = profit({ ...gin, commissionRate: costOf(st, 'commission', c.id), shipping: costOf(st, 'shipping', c.id), fee: costOf(st, 'service_fee', c.id), feeRate: costOf(st, 'fee_rate', c.id), withholdingRate: costOf(st, 'withholding', c.id) }); return html`<tr>
        <td><span class="ch-name">${chLogo(c.id, true)}${c.name}</span></td><td class="r num">%${n(costRaw(st, 'commission', c.id))}</td>
        <td class="r num">${money(x.payout)}</td><td class="r num" style="font-weight:750;color:${x.unitProfit >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(x.unitProfit)}</td></tr>`; })}
      </tbody></table></div></div>`);
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
      v.commissionRate = String(costRaw(st, 'commission', id));
      v.shipping = String(costRaw(st, 'shipping', id)); v.fee = String(costRaw(st, 'service_fee', id));
      v.feeRate = String(costRaw(st, 'fee_rate', id)); v.withholdingRate = String(costRaw(st, 'withholding', id));
      for (const k of ['commissionRate', 'shipping', 'fee', 'feeRate', 'withholdingRate']) { const i = $(`[data-k=${k}]`, el); if (i) i.value = v[k]; }
      $$('[data-ch]', el).forEach((b) => b.classList.toggle('on', b === c));
      calc();
    }
    if (e.target.closest('[data-act=go]')) { calc(); $('[data-result]', el).scrollIntoView({ behavior: 'smooth', block: 'start' }); }
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
