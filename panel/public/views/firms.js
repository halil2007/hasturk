// Firmalar (alt şirketler): CRM'i kullandırdığımız müşteri firmaların panelleri, abonelikleri ve tahsilatları.
// Her firma ayrı bir müşteri panelidir (kendi verisi, API bilgileri, personeli). Abonelik bitiş tarihi geçince firma giriş yapamaz
// (ana panelin destek oturumu girebilir). Ödeme kaydı aboneliği seçilen ay kadar uzatır. Kullanım özeti firmanın panelinden saatte bir gelir.
import { api, html, render, $, $$, n, money, money0, date, dateTime, ago, actions, busy, toast, sheet, confirmBox, debounce, isMobile } from '../core.js';
import { apiGuide as guideText } from '../apiguide.js';

const DAY = 864e5;
const PLANS = ['Başlangıç', 'Profesyonel', 'Kurumsal', 'Özel'];
const METHODS = ['Havale / EFT', 'Kredi kartı', 'Nakit', 'Diğer'];
const iso = (ms) => (ms ? new Date(ms + 3 * 3600e3).toISOString().slice(0, 10) : '');
const daysLeft = (t) => (t.expires_at ? Math.ceil((t.expires_at - Date.now()) / DAY) : null);
// Durum: askıda > süresi doldu > deneme > yaklaşıyor > aktif
function stateOf(t) {
  if (!t.active) return ['bad', 'Askıda', 'suspended'];
  const d = daysLeft(t);
  if (d != null && d < 0) return ['bad', 'Süresi doldu', 'expired'];
  if (t.trial) return ['info', d != null ? `Deneme · ${d} gün` : 'Deneme', 'trial'];
  if (d != null && d <= 14) return ['amber', `${d} gün kaldı`, 'soon'];
  return ['good', 'Aktif', 'active'];
}
const monthly = (t) => (!t.fee || !t.active || stateOf(t)[2] === 'expired' || t.trial ? 0 : t.period === 'yearly' ? t.fee / 12 : t.fee);

export async function firmsView(el) {
  let T = { tenants: [] };
  const f = { q: '', st: 'all' };
  render(el, html`<div class="stack">
    <div class="kpis five" data-kpis></div>
    <div class="row wrap page-actions">
      <div class="search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Firma adı, kod, yetkili, e-posta, şehir" data-q></div>
      <span class="spacer"></span>
      <button class="btn primary" data-act="add" data-fab><i class="ico ico-plus"></i>Firma ekle</button>
    </div>
    <div class="tabs" data-tabs></div>
    <div data-warn></div>
    <div class="card flush" data-box></div>
    <details class="card"><summary><b>Firmalar nasıl çalışır?</b></summary><div class="stack small" style="margin-top:10px">
      <div>Her firma <b>kendi müşteri panelini</b> kullanır: kendi API bilgileri, siparişleri, ürünleri ve personeli tamamen ayrıdır. Panel güncellemeleri tüm firmalara aynı anda gelir.</div>
      <div>Firma, giriş ekranında <b>“Müşteri paneli girişi”</b>ne dokunup firma kodunu yazar ya da size özel adresle (<span class="num">/?firma=kod</span>) doğrudan girer.</div>
      <div><b>Abonelik bitiş tarihi</b> geçince firma panele giremez; veriler silinmez. <b>Ödeme al</b> ile tahsilatı kaydedip aboneliği uzatırsınız. <b>Askıya al</b> girişi ve senkronu hemen durdurur.</div>
      <div><b>Kullanıcı sınırı</b> girilirse firma bu sayıdan fazla aktif kullanıcı ekleyemez. <b>Panele gir</b> ile 2 saatlik destek oturumu açarsınız.</div>
    </div></details>
  </div>`);

  const visible = () => T.tenants.filter((t) => {
    const s = stateOf(t)[2];
    if (f.st !== 'all' && !(f.st === s || (f.st === 'active' && ['active', 'soon'].includes(s)))) return false;
    const q = f.q.toLocaleLowerCase('tr');
    return !q || [t.name, t.slug, t.legal, t.contact, t.email, t.phone, t.city, t.plan].some((x) => String(x || '').toLocaleLowerCase('tr').includes(q));
  });
  const usageLine = (t) => {
    const u = t.usage;
    if (!u) return html`<span class="muted tiny">henüz veri yok</span>`;
    return html`<div class="small"><b>${n(u.users)}</b>${t.max_users ? `/${t.max_users}` : ''} kullanıcı · <b>${n(u.channels)}</b> kanal</div><div class="muted tiny">${n(u.orders30)} sipariş / 30 gün · ${u.last_login ? `son giriş ${ago(u.last_login)}` : 'giriş yok'}</div>`;
  };
  const sub = (t) => (t.expires_at ? html`<div class="small">${date(t.expires_at)}</div>` : html`<span class="muted tiny">süresiz</span>`);
  const fee = (t) => (t.fee ? html`<div class="small"><b>${money0(t.fee)}</b> / ${t.period === 'yearly' ? 'yıl' : 'ay'}</div>` : html`<span class="muted tiny">ücret girilmedi</span>`);

  function draw() {
    const all = T.tenants, by = (k) => all.filter((t) => stateOf(t)[2] === k).length;
    const mrr = all.reduce((a, t) => a + monthly(t), 0);
    render($('[data-kpis]', el), html`
      <div class="kpi"><div class="label">Firma</div><div class="value num">${n(all.length)}</div><div class="delta flat">${by('active') + by('soon')} aktif · ${by('trial')} deneme</div></div>
      <div class="kpi"><div class="label">Aylık gelir (MRR)</div><div class="value num">${money0(mrr)}</div><div class="delta flat">yıllık ≈ ${money0(mrr * 12)}</div></div>
      <div class="kpi"><div class="label">14 gün içinde bitecek</div><div class="value num ${by('soon') ? 'low' : ''}">${n(by('soon'))}</div><div class="delta flat">yenileme bekliyor</div></div>
      <div class="kpi"><div class="label">Süresi dolan</div><div class="value num" style="${by('expired') ? 'color:var(--bad)' : ''}">${n(by('expired'))}</div><div class="delta flat">giriş kapalı</div></div>
      <div class="kpi"><div class="label">Askıda</div><div class="value num">${n(by('suspended'))}</div><div class="delta flat">giriş ve senkron durdu</div></div>`);
    const tabs = [['all', 'Tümü', all.length], ['active', 'Aktif', by('active') + by('soon')], ['trial', 'Deneme', by('trial')], ['soon', 'Bitmek üzere', by('soon')], ['expired', 'Süresi doldu', by('expired')], ['suspended', 'Askıda', by('suspended')]];
    render($('[data-tabs]', el), html`${tabs.map(([k, t, c]) => html`<button class="tab ${f.st === k ? 'on' : ''} ${k === 'expired' && c ? 'warn-tab' : ''}" data-act="st" data-k="${k}">${t}<span class="n">${c}</span></button>`)}`);
    render($('[data-warn]', el), T.error ? html`<div class="notice bad"><i class="ico ico-warn"></i><div>${T.error}</div></div>` : T.ready === false ? html`<div class="notice warn"><i class="ico ico-warn"></i><div>Müşteri panelleri için Cloudflare'de Durable Object bağlantısı gerekir; bu sürüm yayınlandığında (wrangler.jsonc) kendiliğinden oluşur.</div></div>` : '');
    const list = visible();
    if (isMobile()) {
      render($('[data-box]', el), html`<div class="m-list">${list.map((t) => { const [c, s] = stateOf(t); return html`<div class="m-card fm-card" data-slug="${t.slug}">
        <div class="row"><span class="u-av">${t.name.slice(0, 2).toLocaleUpperCase('tr')}</span><div style="min-width:0;flex:1"><div class="ellipsis" style="font-weight:700">${t.name}</div><div class="muted tiny ellipsis">${t.slug}${t.contact ? ' · ' + t.contact : ''}${t.city ? ' · ' + t.city : ''}</div></div><span class="pill ${c}">${s}</span></div>
        <div class="fm-grid"><div><span>Paket</span>${t.plan ? html`<b>${t.plan}</b>` : ''}${fee(t)}</div><div><span>Bitiş</span>${sub(t)}</div><div><span>Kullanım</span>${usageLine(t)}</div></div>
      </div>`; })}${list.length ? '' : html`<div class="empty">${all.length ? 'Bu filtrede firma yok' : 'Henüz firma eklenmedi'}</div>`}</div>`);
      return;
    }
    render($('[data-box]', el), html`<div class="table-wrap"><table class="t"><thead><tr><th>Firma</th><th>Firma kodu</th><th>Paket / ücret</th><th>Abonelik bitişi</th><th>Kullanım</th><th>Durum</th><th></th></tr></thead><tbody>
      ${list.map((t) => { const [c, s] = stateOf(t); return html`<tr class="click" data-slug="${t.slug}">
        <td><div style="font-weight:650">${t.name}</div><div class="muted tiny">${[t.contact, t.phone, t.email].filter(Boolean).join(' · ') || t.legal || ''}</div></td>
        <td><b class="num">${t.slug}</b><div class="muted tiny">yönetici: ${t.admin_username || '—'}</div></td>
        <td>${t.plan ? html`<div class="small" style="font-weight:650">${t.plan}</div>` : ''}${fee(t)}</td>
        <td>${sub(t)}${t.last_payment ? html`<div class="muted tiny">son ödeme ${date(t.last_payment)}</div>` : ''}</td>
        <td>${usageLine(t)}</td>
        <td><span class="pill ${c}">${s}</span></td>
        <td class="r"><button class="btn sm" data-act="open">Aç</button></td></tr>`; })}
    </tbody></table></div>${list.length ? '' : html`<div class="empty">${all.length ? 'Bu filtrede firma yok' : 'Henüz firma eklenmedi — “Firma ekle” ile ilk müşteri panelini oluşturun'}</div>`}`);
  }
  const refresh = async () => { T = await api('tenants', { fresh: true }).catch((e) => ({ tenants: [], error: e.message })); draw(); };
  const bySlug = (s) => T.tenants.find((t) => t.slug === s);

  // ---------- firma formu ----------
  function form(t) {
    const s = sheet({
      title: t ? `${t.name} · düzenle` : 'Yeni firma', size: 'wide',
      body: html`<form class="stack" data-f autocomplete="off">
        <div class="card"><h3 style="margin-bottom:10px">Firma</h3><div class="form-grid">
          <label class="field"><span>Firma adı *</span><input class="input" name="name" value="${t ? t.name : ''}" required placeholder="ör. Yeşil Bahçe"></label>
          <label class="field"><span>Firma kodu *</span><input class="input" name="slug" value="${t ? t.slug : ''}" ${t ? 'disabled' : ''} required pattern="[a-z0-9][a-z0-9-]{1,30}[a-z0-9]" placeholder="ör. yesil-bahce" autocapitalize="none"><small>${t ? 'Sonradan değişmez' : 'Girişte yazılır: küçük harf, rakam, tire'}</small></label>
          <label class="field"><span>Ticari ünvan</span><input class="input" name="legal" value="${t ? t.legal : ''}" placeholder="ör. Yeşil Bahçe Tarım Ltd. Şti."></label>
          <label class="field"><span>Vergi dairesi / no</span><input class="input" name="tax" value="${t ? t.tax : ''}"></label>
          <label class="field"><span>Yetkili kişi</span><input class="input" name="contact" value="${t ? t.contact : ''}"></label>
          <label class="field"><span>E-posta</span><input class="input" type="email" name="email" value="${t ? t.email || '' : ''}"></label>
          <label class="field"><span>Telefon</span><input class="input" type="tel" name="phone" value="${t ? t.phone || '' : ''}"></label>
          <label class="field"><span>Şehir</span><input class="input" name="city" value="${t ? t.city : ''}"></label>
        </div><label class="field" style="margin-top:12px"><span>Adres</span><input class="input" name="address" value="${t ? t.address : ''}"></label></div>

        <div class="card"><h3 style="margin-bottom:10px">Paket ve abonelik</h3><div class="form-grid">
          <label class="field"><span>Paket</span><input class="input" name="plan" value="${t ? t.plan : ''}" list="f-plans" placeholder="ör. Profesyonel"></label>
          <label class="field"><span>Ücret (₺, KDV hariç)</span><input class="input" name="fee" inputmode="decimal" value="${t && t.fee != null ? t.fee : ''}"></label>
          <label class="field"><span>Ödeme dönemi</span><select class="input" name="period"><option value="monthly" ${t && t.period === 'yearly' ? '' : 'selected'}>Aylık</option><option value="yearly" ${t && t.period === 'yearly' ? 'selected' : ''}>Yıllık</option></select></label>
          <label class="field"><span>Kullanıcı sınırı</span><input class="input" name="max_users" inputmode="numeric" value="${t && t.max_users ? t.max_users : ''}" placeholder="boş = sınırsız"></label>
          <label class="field"><span>Başlangıç</span><input class="input" type="date" name="starts_at" value="${t ? iso(t.starts_at) : iso(Date.now())}"></label>
          <label class="field"><span>Bitiş (bu tarihten sonra giriş kapanır)</span><input class="input" type="date" name="expires_at" value="${t ? iso(t.expires_at) : ''}"><small>Boş = süresiz</small></label>
        </div><datalist id="f-plans">${PLANS.map((p) => html`<option value="${p}">`)}</datalist>
          <label class="check" style="margin-top:10px"><input type="checkbox" name="trial" ${t && t.trial ? 'checked' : ''}> Deneme sürümü ${t ? '' : html`<span class="muted tiny">(bitiş boşsa 14 gün)</span>`}</label></div>

        ${t ? html`<div class="card"><label class="check"><span class="switch"><input type="checkbox" name="active" ${t.active ? 'checked' : ''}><span></span></span> Panel aktif (kapalıysa askıya alınır: giriş ve senkron durur, veriler korunur)</label></div>`
    : html`<div class="card"><h3 style="margin-bottom:10px">Firmanın panel yöneticisi</h3><div class="form-grid">
          <label class="field"><span>Kullanıcı adı *</span><input class="input" name="admin_username" required autocapitalize="none" placeholder="ör. ali"></label>
          <label class="field"><span>Şifre * (en az 8 karakter)</span><input class="input" type="password" name="admin_password" autocomplete="new-password" required></label>
        </div><div class="muted tiny" style="margin-top:6px">Firma bu bilgilerle girer; kendi personelini kendi panelinden ekler.</div></div>`}
        <div class="card"><label class="field"><span>Not (sözleşme, özel koşul…)</span><textarea class="input" name="note" rows="2">${t ? t.note || '' : ''}</textarea></label></div>
      </form>`,
      foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>${t ? 'Kaydet' : 'Firmayı oluştur'}</button>`,
    });
    const fm = $('[data-f]', s.el);
    $('[data-save]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
      if (!fm.reportValidity()) return;
      const b = Object.fromEntries(['name', 'legal', 'tax', 'contact', 'email', 'phone', 'city', 'address', 'plan', 'fee', 'period', 'max_users', 'starts_at', 'expires_at', 'note'].map((k) => [k, fm[k].value.trim()]));
      b.trial = fm.trial.checked;
      if (t) { b.active = fm.active.checked; await api('tenants/' + t.slug, { method: 'PUT', body: b }); }
      else {
        const slug = fm.slug.value.trim().toLocaleLowerCase('tr');
        await api('tenants', { method: 'POST', body: { ...b, slug, admin_username: fm.admin_username.value.trim(), admin_password: fm.admin_password.value } });
        toast(`Firma oluşturuldu · giriş: ${location.origin}/?firma=${slug}`);
      }
      s.close(); if (t) toast('Kaydedildi'); await refresh(); if (t) detail(t.slug);
    });
  }

  // ---------- ödeme ----------
  function payment(t, done) {
    const s = sheet({
      title: `${t.name} · ödeme al`, size: 'narrow',
      body: html`<form class="stack" data-f>
        <label class="field"><span>Tutar (₺)</span><input class="input" name="amount" inputmode="decimal" value="${t.fee || ''}"></label>
        <label class="field"><span>Aboneliği uzat</span><select class="input" name="months">${[[0, 'Uzatma'], [1, '1 ay'], [3, '3 ay'], [6, '6 ay'], [12, '1 yıl'], [24, '2 yıl']].map(([v, l]) => html`<option value="${v}" ${v === (t.period === 'yearly' ? 12 : 1) ? 'selected' : ''}>${l}</option>`)}</select>
          <small>${t.expires_at ? `Şu anki bitiş: ${date(t.expires_at)}${daysLeft(t) < 0 ? ' (geçti; uzatma bugünden başlar)' : ''}` : 'Şu an süresiz; uzatma bugünden başlar'}</small></label>
        <label class="field"><span>Ödeme yöntemi</span><select class="input" name="method">${METHODS.map((m) => html`<option>${m}</option>`)}</select></label>
        <label class="field"><span>Ödeme tarihi</span><input class="input" type="date" name="date" value="${iso(Date.now())}"></label>
        <label class="field"><span>Not</span><input class="input" name="note" placeholder="ör. Ekim faturası, dekont no"></label>
      </form>`,
      foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>Kaydet</button>`,
    });
    const fm = $('[data-f]', s.el);
    $('[data-save]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
      const r = await api(`tenants/${t.slug}/payments`, { method: 'POST', body: { amount: fm.amount.value, months: Number(fm.months.value), method: fm.method.value, date: fm.date.value, note: fm.note.value } });
      s.close(); toast(r.expires_at ? `Ödeme kaydedildi · yeni bitiş: ${date(r.expires_at)}` : 'Ödeme kaydedildi'); await refresh(); done && done();
    });
  }

  // ---------- dış API (stok aktarımı) ----------
  // Yalnız ana panel yetkilendirir: anahtar firma koduna bağlıdır, dış sistem yalnız o mağazanın ürün ve stoklarını okur.
  function apiCard(t2) {
    const a = t2.api || {};
    return html`<div class="card"><div class="card-head"><h3>Dış API (stok aktarımı)</h3><span class="pill ${a.on ? 'good' : ''}">${a.on ? 'Açık' : 'Kapalı'}</span></div>
      <div class="muted small" style="margin-bottom:8px">Firmanın kendi sistemi (ERP, site, muhasebe) bu mağazanın ürün ve stoklarını okur. Yalnız bu mağaza; yazma yok. Firma yöneticisi bu ayarı göremez ve değiştiremez.</div>
      ${a.hasKey ? html`<dl class="kv"><dt>Anahtar</dt><dd class="num">${a.hint}</dd><dt>Oluşturma</dt><dd>${a.created_at ? dateTime(a.created_at) : '—'}</dd>
        <dt>Son erişim</dt><dd>${a.last_at ? html`${ago(a.last_at)}${a.last_ip ? html` <span class="muted tiny">(${a.last_ip})</span>` : ''}` : 'henüz yok'}</dd><dt>Toplam istek</dt><dd>${n(a.calls || 0)}</dd></dl>` : ''}
      <label class="field" style="margin-top:8px"><span>İzin verilen IP adresleri (isteğe bağlı)</span><textarea class="input" rows="2" data-api-ips placeholder="Boş: her yerden · ör. 85.105.10.25, 85.105.10.0/24">${(a.ips || []).join(', ')}</textarea></label>
      <div class="row wrap" style="gap:6px;margin-top:8px">
        ${!a.hasKey ? html`<button class="btn sm primary" data-x="api-enable"><i class="ico ico-key"></i>API erişimini aç</button>`
          : html`${a.on ? html`<button class="btn sm" data-x="api-disable">Kapat</button>` : html`<button class="btn sm primary" data-x="api-resume">Yeniden aç</button>`}<button class="btn sm" data-x="api-rotate"><i class="ico ico-sync"></i>Yeni anahtar</button>`}
        <button class="btn sm ghost" data-x="api-ips">IP kısıtını kaydet</button><span class="spacer"></span><button class="btn sm ghost" data-x="api-doc"><i class="ico ico-help"></i>Kullanım kılavuzu</button>
      </div></div>`;
  }
  const apiGuide = (t2, key) => guideText(t2.name, key);
  function apiKeyShow(t2, key) {
    const s2 = sheet({ title: 'API anahtarı oluşturuldu', size: 'narrow', body: html`<div class="stack">
      <div class="notice warn small"><i class="ico ico-warn"></i><div>Anahtar <b>yalnız bir kez</b> gösterilir. Kopyalayıp firmanın dış sistemine girin (ya da güvenli yolla firmaya iletin).</div></div>
      <input class="input num" readonly value="${key}" data-k style="font-size:13px">
      <div class="row wrap" style="gap:6px"><button class="btn sm primary" data-c="key"><i class="ico ico-copy"></i>Anahtarı kopyala</button><button class="btn sm" data-c="doc"><i class="ico ico-copy"></i>Kılavuzu anahtarla kopyala</button></div>
    </div>`, foot: html`<span class="spacer"></span><button class="btn" data-close>Kapat</button>` });
    s2.el.addEventListener('click', (e) => {
      const c = e.target.closest('[data-c]');
      if (c) navigator.clipboard.writeText(c.dataset.c === 'key' ? key : apiGuide(t2, key)).then(() => toast('Kopyalandı')).catch(() => toast('Kopyalanamadı; elle seçin', true));
    });
  }
  function apiDoc(t2) {
    const s2 = sheet({ title: 'Stok API — kullanım kılavuzu', size: 'wide', body: html`<pre class="err-stack" style="max-height:none;font-size:12.5px">${apiGuide(t2)}</pre>`,
      foot: html`<span class="spacer"></span><button class="btn" data-copy><i class="ico ico-copy"></i>Kopyala</button><button class="btn primary" data-close>Kapat</button>` });
    $('[data-copy]', s2.el).onclick = () => navigator.clipboard.writeText(apiGuide(t2)).then(() => toast('Kılavuz kopyalandı')).catch(() => {});
  }

  // ---------- firma ayrıntısı ----------
  async function detail(slug) {
    const t = bySlug(slug);
    if (!t) return;
    const s = sheet({ title: t.name, size: 'wide drawer' });
    const draw2 = async () => {
      const t2 = bySlug(slug) || t, [c, st] = stateOf(t2), d = daysLeft(t2), link = location.origin + '/?firma=' + t2.slug;
      const pays = await api(`tenants/${slug}/payments`, { fresh: true }).catch(() => ({ payments: [] }));
      const u = t2.usage || {};
      s.setBody(html`<div class="row wrap" style="margin-bottom:12px"><span class="pill ${c}">${st}</span>${t2.plan ? html`<span class="pill">${t2.plan}</span>` : ''}<span class="muted small">kod: <b class="num">${t2.slug}</b></span><span class="spacer"></span>
          <button class="btn sm primary" data-x="pay"><i class="ico ico-calc"></i>Ödeme al</button><button class="btn sm" data-x="support" ${t2.active ? '' : 'disabled'}><i class="ico ico-key"></i>Panele gir</button><button class="btn sm" data-x="edit"><i class="ico ico-gear"></i>Düzenle</button></div>
        <div class="two-col">
          <div class="stack">
            <div class="card"><div class="card-head"><h3>Abonelik</h3></div><dl class="kv">
              <dt>Ücret</dt><dd>${t2.fee ? `${money(t2.fee)} / ${t2.period === 'yearly' ? 'yıl' : 'ay'}` : '—'}</dd>
              <dt>Başlangıç</dt><dd>${t2.starts_at ? date(t2.starts_at) : '—'}</dd>
              <dt>Bitiş</dt><dd>${t2.expires_at ? html`${date(t2.expires_at)} <span class="${d < 0 ? 'down' : d <= 14 ? 'low' : 'muted'}">(${d < 0 ? `${-d} gün önce doldu` : `${d} gün kaldı`})</span>` : 'süresiz'}</dd>
              <dt>Kullanıcı sınırı</dt><dd>${t2.max_users || 'sınırsız'}</dd>
              <dt>Toplam tahsilat</dt><dd>${money(t2.paid_total || 0)}</dd></dl></div>
            <div class="card"><div class="card-head"><h3>Tahsilatlar</h3><button class="btn sm ghost" data-x="pay"><i class="ico ico-plus"></i>Ekle</button></div>
              ${pays.payments.length ? html`<div class="list">${pays.payments.map((p) => html`<div class="li"><div style="flex:1;min-width:0"><b class="num">${money(p.amount)}</b>${p.months ? html` <span class="pill good" style="margin-left:4px">+${p.months >= 12 && p.months % 12 === 0 ? `${p.months / 12} yıl` : `${p.months} ay`}</span>` : ''}
                <div class="muted tiny">${date(p.at)}${p.method ? ` · ${p.method}` : ''}${p.note ? ` · ${p.note}` : ''}${p.user ? ` · ${p.user}` : ''}</div></div><button class="icon-btn sm" data-x="delpay" data-id="${p.id}" aria-label="Kaydı sil" title="Kaydı sil (bitiş tarihi değişmez)"><i class="ico ico-x"></i></button></div>`)}</div>` : html`<div class="muted small">Henüz ödeme kaydı yok</div>`}</div>
          </div>
          <div class="stack">
            <div class="card"><div class="card-head"><h3>Kullanım</h3><button class="btn sm ghost" data-x="usage"><i class="ico ico-sync"></i>Yenile</button></div>
              ${t2.usage ? html`<div class="fm-usage"><div><b>${n(u.users)}${t2.max_users ? `/${t2.max_users}` : ''}</b><span>kullanıcı</span></div><div><b>${n(u.channels)}</b><span>kanal</span></div><div><b>${n(u.products)}</b><span>ürün</span></div>
                <div><b>${n(u.orders30)}</b><span>sipariş (30 gün)</span></div><div><b>${money0(u.revenue30)}</b><span>ciro (30 gün)</span></div><div><b>${n(u.orders)}</b><span>toplam sipariş</span></div></div>
                <div class="muted tiny" style="margin-top:8px">Son giriş ${u.last_login ? dateTime(u.last_login) : '—'} · son sipariş ${u.last_order ? dateTime(u.last_order) : '—'} · güncellendi ${t2.usage_at ? ago(t2.usage_at) : '—'}</div>` : html`<div class="muted small">Henüz kullanım verisi yok — “Yenile” ile alın</div>`}</div>
            <div class="card"><div class="card-head"><h3>Firma bilgileri</h3></div><dl class="kv">
              ${[['Ünvan', t2.legal], ['Vergi', t2.tax], ['Yetkili', t2.contact], ['E-posta', t2.email], ['Telefon', t2.phone], ['Şehir', t2.city], ['Adres', t2.address], ['Panel yöneticisi', t2.admin_username], ['Oluşturma', date(t2.created_at)], ['Not', t2.note]].filter(([, v]) => v).map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>
              <div class="row" style="margin-top:10px"><input class="input" readonly value="${link}" style="flex:1;font-size:13px"><button class="btn sm" data-x="copy"><i class="ico ico-copy"></i>Giriş adresi</button></div></div>
            ${apiCard(t2)}
            <div class="card"><div class="card-head"><h3>Yönetim</h3></div><div class="stack" style="gap:8px">
              <div class="row"><input class="input" type="password" data-newpw placeholder="Firma yöneticisi için yeni şifre" autocomplete="new-password" style="flex:1"><button class="btn sm" data-x="pw">Şifreyi sıfırla</button></div>
              <div class="row wrap"><button class="btn sm" data-x="toggle">${t2.active ? 'Askıya al' : 'Askıdan çıkar'}</button><span class="spacer"></span><button class="btn sm ghost" data-x="del" style="color:var(--bad)"><i class="ico ico-x"></i>Firmayı ve tüm verisini sil</button></div>
            </div></div>
          </div>
        </div>`);
    };
    s.el.addEventListener('click', async (e) => {
      const x = e.target.closest('[data-x]');
      if (!x) return;
      const t2 = bySlug(slug) || t, k = x.dataset.x;
      if (k === 'pay') payment(t2, draw2);
      if (k.startsWith('api-')) {
        const act = k.slice(4);
        if (act === 'doc') return apiDoc(t2);
        if (act === 'rotate' && !(await confirmBox('Yeni anahtar oluşturulsun mu? Eski anahtar hemen geçersiz olur; firmanın dış sistemine yenisini girmeniz gerekir.', 'Yeni anahtar'))) return;
        if (act === 'disable' && !(await confirmBox(`${t2.name} için dış API erişimi kapatılsın mı? Dış sistem stokları okuyamaz (anahtar saklanır, yeniden açılabilir).`, 'Kapat'))) return;
        busy(x, async () => {
          const r = await api(`tenants/${slug}/api`, { method: 'POST', body: { action: act, ips: act === 'ips' ? $('[data-api-ips]', s.el).value : undefined } });
          await refresh(); await draw2();
          if (r.key) apiKeyShow(t2, r.key); else toast({ disable: 'API erişimi kapatıldı', resume: 'API erişimi açıldı', ips: 'IP kısıtı kaydedildi' }[act] || 'Kaydedildi');
        });
        return;
      }
      if (k === 'edit') { s.close(); form(t2); }
      if (k === 'copy') { navigator.clipboard.writeText(location.origin + '/?firma=' + slug).then(() => toast('Giriş adresi kopyalandı')).catch(() => {}); }
      if (k === 'usage') busy(x, async () => { await api(`tenants/${slug}/stats`, { fresh: true }); await refresh(); await draw2(); });
      if (k === 'delpay') { if (await confirmBox('Bu ödeme kaydı silinsin mi? Abonelik bitiş tarihi değişmez.', 'Sil')) busy(x, async () => { await api(`tenants/${slug}/payments/${x.dataset.id}`, { method: 'DELETE' }); await refresh(); await draw2(); }); }
      if (k === 'pw') busy(x, async () => { const i = $('[data-newpw]', s.el); await api(`tenants/${slug}/password`, { method: 'POST', body: { password: i.value } }); i.value = ''; toast(`${t2.admin_username} şifresi sıfırlandı`); });
      if (k === 'toggle') { if (await confirmBox(t2.active ? `${t2.name} askıya alınsın mı? Giriş ve senkron hemen durur, veriler korunur.` : `${t2.name} yeniden açılsın mı?`, t2.active ? 'Askıya al' : 'Aç')) busy(x, async () => { await api('tenants/' + slug, { method: 'PUT', body: { active: !t2.active } }); await refresh(); await draw2(); }); }
      if (k === 'support') {
        if (!(await confirmBox(`${t2.name} paneline destek oturumuyla girilsin mi? Ana panelden çıkış yapılır; dönmek için üstteki “Ana panele dön”e basın.`, 'Panele gir'))) return;
        await api(`tenants/${slug}/support`, { method: 'POST' }); location.hash = '#/'; location.reload();
      }
      if (k === 'del') {
        const code = prompt(`Bu işlem ${t2.name} panelindeki TÜM verileri (siparişler, ürünler, API bilgileri, kullanıcılar, tahsilatlar) kalıcı olarak siler. Onaylamak için firma kodunu yazın: ${slug}`);
        if (code === null) return;
        busy(x, async () => { await api(`tenants/${slug}/delete`, { method: 'POST', body: { confirm: code.trim() } }); s.close(); toast('Firma silindi'); refresh(); });
      }
    });
    s.setBody(html`<div class="empty"><i class="ico ico-sync spin"></i></div>`);
    await draw2();
  }

  actions(el, {
    add: () => form(null),
    open: (t) => detail(t.closest('[data-slug]').dataset.slug),
    st: (t) => { f.st = t.dataset.k; draw(); },
  });
  el.addEventListener('click', (e) => {
    const r = e.target.closest('[data-slug]');
    if (r && !e.target.closest('button, a, input')) detail(r.dataset.slug);
  });
  $('[data-q]', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); draw(); }, 200));
  await refresh();
  return { refresh };
}
