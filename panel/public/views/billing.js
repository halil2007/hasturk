// Paketim (müşteri panelleri): mevcut paket ve bitiş tarihi, paketler, kartla satın alma / yenileme / yükseltme (iyzico)
// ve ödeme geçmişi. Ödeme iyzico'nun güvenli sayfasında yapılır; kart bilgisi panele gelmez. Tutar sunucuda belirlenir.
import { api, html, render, $, $$, money0, date, toast, sheet, state } from '../core.js';

const PERIOD = { monthly: 'Aylık', yearly: 'Yıllık' };
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
    <div class="plans-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">
      ${d.plans.map((p) => html`<div class="card" style="display:flex;flex-direction:column;gap:8px;${cur.plan === p.name ? 'outline:2px solid var(--primary)' : ''}">
        <div class="row"><b style="font-size:18px;flex:1">${p.name}</b>${cur.plan === p.name ? html`<span class="pill info">Mevcut</span>` : ''}</div>
        <div class="muted small">${p.stores} mağaza · ${p.users ? `${p.users} kullanıcı` : 'sınırsız kullanıcı'}</div>
        <div><b style="font-size:20px">${money0(p.monthly)}</b> <span class="muted small">/ ay · KDV dahil</span></div>
        <div class="small">Yıllık <b>${money0(p.yearly)}</b> <span class="muted">(2 ay hediye${d.installments > 1 ? ` · peşin fiyatına ${d.installments} taksit` : ''})</span></div>
        ${admin && d.online ? html`<div class="row wrap" style="gap:8px;margin-top:auto">
          <button class="btn sm" data-buy="${p.key}" data-period="monthly">Aylık al</button>
          <button class="btn primary sm" data-buy="${p.key}" data-period="yearly">Yıllık al</button></div>` : ''}
      </div>`)}
    </div>
    <div class="muted tiny">Satın aldığınız süre, mevcut bitiş tarihinizin üstüne eklenir; paket değişikliği hemen geçerli olur. Ödeme iyzico güvencesiyle alınır, kart bilgileriniz bize ulaşmaz.</div>
    <div class="card flush"><div class="card-pad"><h3>Ödeme geçmişi</h3></div>
      ${d.payments.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Tarih</th><th>Açıklama</th><th class="r">Süre</th><th class="r">Tutar</th></tr></thead><tbody>
        ${d.payments.map((x) => html`<tr><td>${date(x.at)}</td><td class="small">${x.method || ''}${x.note ? html`<div class="muted tiny">${x.note}</div>` : ''}</td><td class="r">${x.months ? `${x.months} ay` : '—'}</td><td class="r num">${money0(x.amount)}</td></tr>`)}
      </tbody></table></div>` : html`<div class="empty">Henüz ödeme yok.</div>`}</div>
  </div>`);
  $$('[data-buy]', el).forEach((b) => { b.onclick = () => buy(d, d.plans.find((p) => p.key === b.dataset.buy), b.dataset.period); });
}

function buy(d, p, period) {
  const amount = p[period];
  const s = sheet({
    title: `${p.name} · ${PERIOD[period]}`,
    body: html`<form class="stack" data-f>
      <div class="notice"><i class="ico ico-info"></i><div><b>${money0(amount)}</b> (KDV dahil) · ${period === 'yearly' ? `12 ay${d.installments > 1 ? `, kartla peşin fiyatına ${d.installments} taksit` : ''}` : '1 ay'}. Fatura bilgileri:</div></div>
      <div class="form-grid">
        <label class="field"><span>Yetkili ad soyad *</span><input class="input" name="contact" required></label>
        <label class="field"><span>E-posta *</span><input class="input" type="email" name="email" value="${d.current.email || (state.user && state.user.email) || ''}" required></label>
        <label class="field"><span>Cep telefonu *</span><input class="input" name="phone" inputmode="tel" placeholder="05xx xxx xx xx" required></label>
        <label class="field"><span>Şehir *</span><input class="input" name="city" required></label>
        <label class="field"><span>TC kimlik / Vergi no</span><input class="input" name="identity" inputmode="numeric"></label>
      </div>
      <label class="field"><span>Fatura adresi *</span><input class="input" name="address" required></label>
      <label class="check"><input type="checkbox" name="consent"> <span><a href="https://hasturkcrm.com/mesafeli-satis-sozlesmesi" target="_blank" rel="noopener">Mesafeli satış sözleşmesini</a> ve <a href="https://hasturkcrm.com/iptal-iade" target="_blank" rel="noopener">iptal / iade koşullarını</a> okudum, onaylıyorum.</span></label>
      <div class="login-err" data-err role="alert"></div>
    </form>`,
    foot: html`<button class="btn" data-close>Vazgeç</button><button class="btn primary" data-pay>Ödemeye geç</button>`,
  });
  $('[data-pay]', s.el).onclick = async (e) => {
    const f = $('[data-f]', s.el), btn = e.currentTarget;
    const b = Object.fromEntries(['contact', 'email', 'phone', 'city', 'identity', 'address'].map((k) => [k, f[k].value.trim()]));
    b.consent = f.consent.checked; b.plan = p.key; b.period = period;
    btn.disabled = true; btn.textContent = 'Ödeme sayfası açılıyor…';
    try { const r = await api('billing/checkout', { method: 'POST', body: b }); location.href = r.url; }
    catch (x) { $('[data-err]', f).textContent = x.message; btn.disabled = false; btn.textContent = 'Ödemeye geç'; toast(x.message, true); }
  };
}
