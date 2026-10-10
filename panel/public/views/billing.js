// Paketim (müşteri panelleri): mevcut paket ve bitiş tarihi, paketler, kartla satın alma / yenileme / yükseltme (iyzico)
// ve ödeme geçmişi. Ödeme iyzico'nun güvenli sayfasında yapılır; kart bilgisi panele gelmez. Tutar sunucuda belirlenir.
// Fatura bilgisi (bireysel / kurumsal) son satın almadan ya da firma kartından dolu gelir; e-posta ve telefon zorunludur.
import { api, html, render, $, $$, money0, money, date, toast, sheet, state } from '../core.js';

const PERIOD = { monthly: 'Aylık', yearly: 'Yıllık' };
// Taksit bilgisi: yıllıkta "peşin fiyatına N taksit"; ayrı satırda "Kredi kartına 12 taksite kadar" (seçenekler ödeme sayfasında)
const instText = (d, yearly) => { const i = d.installments || {}; return yearly && i.free > 1 ? `peşin fiyatına ${i.free} taksit` : ''; };
// Alt paket: abonelik sürerken alınamaz (iade yok); süre dolunca ya da denemede seçilebilir
const lower = (d, p) => { const c = d.plans.find((x) => x.key === d.current.key); return !d.current.downgrade && !!c && p.monthly < c.monthly; };
const up = (d, p) => (d.upgrade ? d.upgrade.options.find((x) => x.to === p.key) : null);
export async function billingView(el) {
  render(el, html`<div class="card"><div class="empty">Yükleniyor…</div></div>`);
  let d;
  try { d = await api('billing'); } catch (e) { render(el, html`<div class="card"><div class="empty">${e.message}</div></div>`); return; }
  const cur = d.current, admin = state.user && state.user.role === 'admin';
  const left = cur.expires_at ? Math.ceil((cur.expires_at - Date.now()) / 864e5) : null;
  render(el, html`<div class="stack">
    <div class="card"><div class="row wrap" style="gap:16px;align-items:center">
      <div style="flex:1;min-width:220px"><div class="muted small">Mevcut paketiniz</div><div style="font-size:22px;font-weight:750">${cur.plan || 'Paket seçilmedi'}${cur.trial ? html` <span class="pill amber">Deneme</span>` : ''}</div>
        <div class="small" style="margin-top:4px">${cur.expires_at ? html`Bitiş: <b>${date(cur.expires_at)}</b>${left != null ? html` · <span style="color:${left <= 7 ? 'var(--bad)' : 'inherit'}">${left <= 0 ? 'süresi doldu' : `${left} gün kaldı`}</span>` : ''}` : 'Süresiz'}</div></div>
      ${!d.online ? html`<div class="notice" style="flex-basis:100%"><i class="ico ico-info"></i><div>Online ödeme henüz açılmadı. Paket almak / yenilemek için Destek sayfasından bize yazın.</div></div>` : ''}
    </div></div>
    ${d.bank ? html`<div class="card small" style="display:grid;gap:4px"><b>🏦 Havale / EFT ile ödeme${d.eftDiscount ? html` <span class="pill good">Yıllıkta %${d.eftDiscount} indirim</span>` : ''}</b>
      <div>${d.bank.bank} · ${d.bank.holder}</div><div class="num" style="font-weight:700;letter-spacing:.3px">${d.bank.iban} <button class="btn sm ghost" data-copy-iban style="min-height:0;padding:2px 8px"><i class="ico ico-copy"></i>Kopyala</button></div>
      <div class="muted">Açıklamaya firma kodunuzu (<b>${(state.tenant && state.tenant.slug) || ''}</b>) ve paketi yazın, ardından Destek'ten bize bildirin; ödemeniz hesabımıza geçince aboneliğiniz uzatılır.</div></div>` : ''}
    <div class="plans-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">
      ${d.plans.map((p) => html`<div class="card" style="display:flex;flex-direction:column;gap:8px;${cur.plan === p.name ? 'outline:2px solid var(--primary)' : ''}">
        <div class="row"><b style="font-size:18px;flex:1">${p.name}</b>${cur.plan === p.name ? html`<span class="pill info">Mevcut</span>` : ''}</div>
        <div class="muted small">${p.stores} mağaza · ${p.users ? `${p.users} kullanıcı` : 'sınırsız kullanıcı'}</div>
        ${(p.features || []).length ? html`<ul class="small" style="margin:0;padding-left:18px">${p.features.map((x) => html`<li>${x}</li>`)}</ul>` : html`<div class="small muted">Tüm temel özellikler</div>`}
        ${(p.soon || []).map((x) => html`<div class="small">${x} <span class="pill amber" style="padding:1px 8px;font-size:11px">Yakında</span></div>`)}
        <div><b style="font-size:20px">${money0(p.monthly)}</b> <span class="muted small">/ ay · KDV dahil</span></div>
        <div class="small">Yıllık <b>${money0(p.yearly)}</b> <span class="muted">(2 ay hediye${instText(d, true) ? ` · ${instText(d, true)}` : ''})</span></div>
        ${(d.installments || {}).max ? html`<div class="small muted">Kredi kartına ${d.installments.max} taksite kadar</div>` : ''}
        ${up(d, p) ? html`<div class="small" style="color:var(--primary)">Şimdi geçiş: <b>${money(up(d, p).amount)}</b> <span class="muted">(kalan ${up(d, p).days} gün için fark)</span></div>` : ''}
        ${admin && d.online && lower(d, p) ? html`<div class="small muted" style="margin-top:auto">Bu pakete aboneliğinizin süresi dolunca geçebilirsiniz.</div>` : ''}
        ${admin && d.online && !lower(d, p) ? html`<div class="row wrap" style="gap:8px;margin-top:auto">
          ${up(d, p) ? html`<button class="btn primary sm" data-up="${p.key}"><i class="ico ico-up"></i>Bu pakete geç</button>` : ''}
          <button class="btn sm" data-buy="${p.key}" data-period="monthly">Aylık al</button>
          <button class="btn ${up(d, p) ? '' : 'primary '}sm" data-buy="${p.key}" data-period="yearly">Yıllık al</button></div>` : ''}
      </div>`)}
    </div>
    ${d.stores && d.stores.base ? html`<div class="card stack" style="gap:10px" data-stores>
      <div class="row wrap" style="gap:10px;align-items:center"><div style="flex:1;min-width:220px"><h3>Mağaza sınırı</h3>
        <div class="small" style="margin-top:4px"><b>${d.stores.used}</b> / ${d.stores.limit} mağaza bağlı${d.stores.extra ? html` <span class="muted">(paketinizde ${d.stores.base} + ${d.stores.extra} ek mağaza)</span>` : ''}</div>
        <div class="bar" style="margin-top:6px;height:6px;border-radius:6px;background:var(--line);overflow:hidden"><span style="display:block;height:100%;width:${Math.min(100, Math.round((d.stores.used / Math.max(1, d.stores.limit)) * 100))}%;background:${d.stores.used >= d.stores.limit ? 'var(--bad)' : 'var(--primary)'}"></span></div></div>
        ${admin && d.online && d.stores.buyable ? html`<div class="row" style="gap:8px;align-items:center"><label class="small">Ek mağaza</label><input class="input" type="number" min="1" max="${d.stores.max}" value="1" data-sqty style="width:80px"><button class="btn primary sm" data-sbuy><i class="ico ico-plus"></i>Ek mağaza al</button></div>` : ''}</div>
      <div class="muted small">Ek mağaza: mağaza başına yıllık <b>${money0(d.stores.yearly)}</b> (KDV dahil). Lisansınızın bitişine kalan <b>${d.stores.days} gün</b> için gün hesabıyla tek seferde alınır: mağaza başına <b data-stotal>${money(d.stores.perStore)}</b>. Paket yenilemesinde ek mağazalarınız korunur ve yenilenen süre kadar ücrete eklenir.${!d.stores.buyable ? ' Deneme süresinde ya da süresi dolmuş abonelikte ek mağaza alınamaz.' : ''}</div>
    </div>` : ''}
    ${d.upgrade && d.upgrade.options.length ? html`<div class="muted tiny"><b>Üst pakete geçiş:</b> bitiş tarihiniz değişmez; yalnız iki paketin ${PERIOD[d.upgrade.period].toLowerCase()} fiyat farkının kalan ${d.upgrade.days} güne düşen kısmı alınır. Yeni paketin özellikleri ödemeden hemen sonra açılır.</div>` : ''}
    <div class="muted tiny">Satın aldığınız süre, mevcut bitiş tarihinizin üstüne eklenir; paket değişikliği hemen geçerli olur. Ödeme iyzico güvencesiyle alınır, kart bilgileriniz bize ulaşmaz.</div>
    <div class="card flush"><div class="card-pad"><h3>Ödeme geçmişi</h3></div>
      ${d.payments.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Tarih</th><th>Açıklama</th><th class="r">Süre</th><th class="r">Tutar</th></tr></thead><tbody>
        ${d.payments.map((x) => html`<tr><td>${date(x.at)}</td><td class="small">${x.method || ''}${x.note ? html`<div class="muted tiny">${x.note}</div>` : ''}</td><td class="r">${x.months ? `${x.months} ay` : '—'}</td><td class="r num">${money0(x.amount)}</td></tr>`)}
      </tbody></table></div>` : html`<div class="empty">Henüz ödeme yok.</div>`}</div>
  </div>`);
  $$('[data-buy]', el).forEach((b) => { b.onclick = () => { const p = d.plans.find((x) => x.key === b.dataset.buy), per = b.dataset.period; buy(d, { title: `${p.name} · ${PERIOD[per]}`, amount: p[per], what: `${per === 'yearly' ? '12 ay' : '1 ay'}${instText(d, per === 'yearly') ? `, kartla ${instText(d, per === 'yearly')}` : ''}`, path: 'billing/checkout', body: { plan: p.key, period: per } }); }; });
  $$('[data-up]', el).forEach((b) => { b.onclick = () => { const q = up(d, { key: b.dataset.up }), p = d.plans.find((x) => x.key === q.to);
    buy(d, { title: `${p.name} paketine geçiş`, amount: q.amount, what: `${cur.plan} → ${p.name}: ${PERIOD[q.period].toLowerCase()} fiyat farkı ${money0(q.diff)} × kalan ${q.days} gün; bitiş tarihiniz (${date(cur.expires_at)}) değişmez${instText(d, q.period === 'yearly') ? `, kartla ${instText(d, q.period === 'yearly')}` : ''}`, path: 'billing/upgrade', body: { plan: q.to } }); }; });
  const sq = $('[data-sqty]', el), sb = $('[data-sbuy]', el);
  const sAmount = () => Math.round(d.stores.perStore * Math.max(1, Math.min(d.stores.max, Math.round(Number(sq.value) || 1))) * 100) / 100;
  if (sq) sq.oninput = () => { $('[data-stotal]', el).textContent = money(sAmount()); };
  if (sb) sb.onclick = () => { const q = Math.max(1, Math.min(d.stores.max, Math.round(Number(sq.value) || 1))); buy(d, { title: `${q} ek mağaza`, amount: sAmount(), what: `${q} mağaza × ${d.stores.days} gün (lisans bitişine kadar, yıllık ${money0(d.stores.yearly)} üzerinden); ödeme alınınca mağaza sınırınız ${d.stores.limit + q} olur`, path: 'billing/stores', body: { qty: q } }); };
  const ci = $('[data-copy-iban]', el); if (ci) ci.onclick = () => navigator.clipboard.writeText(d.bank.iban.replace(/\s/g, '')).then(() => toast('IBAN kopyalandı')).catch(() => {});
}

const INV = ['name', 'tckn', 'company', 'taxOffice', 'taxNo', 'contact', 'address', 'district', 'city'];
function buy(d, { title, amount, what, path, body }) {
  const inv = d.invoice || {};
  let type = inv.type === 'kurumsal' ? 'kurumsal' : 'bireysel';
  const s = sheet({
    title,
    body: html`<form class="stack" data-f>
      <div class="notice"><i class="ico ico-info"></i><div><b>${money0(amount)}</b> (KDV dahil) · ${what}. Faturanız aşağıdaki bilgilerle kesilir.</div></div>
      <div class="form-grid">
        <label class="field"><span>E-posta *</span><input class="input" type="email" name="email" value="${d.current.email || (state.user && state.user.email) || ''}" required></label>
        <label class="field"><span>Telefon *</span><input class="input" name="phone" type="tel" inputmode="tel" placeholder="05xx xxx xx xx" value="${d.current.phone || ''}" required></label>
      </div>
      <div class="row wrap" style="gap:10px;align-items:center"><b class="small">Fatura türü</b><div class="seg" data-type><button type="button" data-v="bireysel">Bireysel</button><button type="button" data-v="kurumsal">Kurumsal</button></div></div>
      <div class="form-grid" data-for="bireysel">
        <label class="field"><span>Ad soyad *</span><input class="input" name="name" value="${inv.name || ''}" autocomplete="name"></label>
        <label class="field"><span>TC kimlik no *</span><input class="input" name="tckn" value="${inv.tckn || ''}" inputmode="numeric" maxlength="11"></label>
      </div>
      <div class="form-grid" data-for="kurumsal">
        <label class="field" style="grid-column:1/-1"><span>Firma unvanı *</span><input class="input" name="company" value="${inv.company || ''}" placeholder="ör. Yeşil Bahçe Tarım Ltd. Şti."></label>
        <label class="field"><span>Vergi dairesi *</span><input class="input" name="taxOffice" value="${inv.taxOffice || ''}"></label>
        <label class="field"><span>Vergi no *</span><input class="input" name="taxNo" value="${inv.taxNo || ''}" inputmode="numeric" maxlength="11"><small>10 hane (şahıs şirketinde TC kimlik no)</small></label>
        <label class="field"><span>Yetkili ad soyad *</span><input class="input" name="contact" value="${inv.contact || ''}"></label>
        <label class="check" style="align-self:end"><input type="checkbox" name="efatura" ${inv.efatura ? 'checked' : ''}> <span>e-Fatura mükellefiyiz</span></label>
      </div>
      <label class="field"><span>Fatura adresi *</span><input class="input" name="address" value="${inv.address || ''}" placeholder="Mahalle, cadde / sokak, no"></label>
      <div class="form-grid">
        <label class="field"><span>İlçe *</span><input class="input" name="district" value="${inv.district || ''}"></label>
        <label class="field"><span>İl *</span><input class="input" name="city" value="${inv.city || ''}"></label>
      </div>
      <label class="check"><input type="checkbox" name="consent"> <span><a href="https://hasturkcrm.com/mesafeli-satis-sozlesmesi" target="_blank" rel="noopener">Mesafeli satış sözleşmesini</a> ve <a href="https://hasturkcrm.com/iptal-iade" target="_blank" rel="noopener">iptal / iade koşullarını</a> okudum, onaylıyorum.</span></label>
      <div class="login-err" data-err role="alert"></div>
    </form>`,
    foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" data-pay>Ödemeye geç</button>`,
  });
  const setType = (v) => { type = v; $$('[data-type] button', s.el).forEach((b) => b.classList.toggle('on', b.dataset.v === v)); $$('[data-for]', s.el).forEach((x) => { x.style.display = x.dataset.for === v ? '' : 'none'; }); };
  $('[data-type]', s.el).onclick = (e) => { const b = e.target.closest('button'); if (b) setType(b.dataset.v); };
  setType(type);
  $('[data-pay]', s.el).onclick = async (e) => {
    const f = $('[data-f]', s.el), btn = e.currentTarget, v = (k) => f.elements[k].value.trim(); // f.name formun kendi adı; alanlar elements'ten
    const b = { email: v('email'), phone: v('phone'), invoice: { type, efatura: f.elements.efatura.checked, ...Object.fromEntries(INV.map((k) => [k, v(k)])) } };
    b.consent = f.elements.consent.checked; Object.assign(b, body);
    btn.disabled = true; btn.textContent = 'Ödeme sayfası açılıyor…';
    try { const r = await api(path, { method: 'POST', body: b }); location.href = r.url; }
    catch (x) { $('[data-err]', f).textContent = x.message; btn.disabled = false; btn.textContent = 'Ödemeye geç'; toast(x.message, true); }
  };
}
