// Kullanıcılar: panele giriş yapacak personel. Yönetici tüm bölümleri (entegrasyon, kullanıcı, ayar) yönetir;
// personel siparişleri, kargoyu, ürün ve stokları kullanır. Ana yönetici Cloudflare'deki PANEL_PASSWORD ile girer.
import { api, state, html, render, $, n, date, dateTime, ago, actions, busy, toast, sheet, confirmBox } from '../core.js';

const ROLE = { admin: 'Yönetici', staff: 'Personel' };

export async function users(el) {
  let rows = [];
  render(el, html`<div class="stack">
    <div class="row wrap"><div style="flex:1"><h2>Kullanıcılar</h2><div class="muted small">Panele giriş yapabilecek kişiler ve yetkileri</div></div><button class="btn primary" data-act="add"><i class="ico ico-plus"></i>Kullanıcı ekle</button></div>
    <div class="card flush" data-box></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px">
      <div class="card"><h3>Yönetici</h3><p class="muted small" style="margin:6px 0 0">Tüm bölümler: entegrasyon (API) ayarları, kullanıcılar, ayarlar, geçmiş sipariş aktarımı, eşleştirme ve stok kuralları.</p></div>
      <div class="card"><h3>Personel</h3><p class="muted small" style="margin:6px 0 0">Siparişleri işleme, kargo etiketi, paket bölme, ürün/stok güncelleme, eşleştirme ve raporlar. API bilgilerini ve kullanıcıları göremez.</p></div>
    </div>
    ${state.owner && (state.user || {}).role === 'admin' ? html`<div class="card flush" data-tenants></div>` : ''}
  </div>`);

  function draw() {
    const me = state.user || {};
    const main = state.tenant ? '' : html`<tr><td><div style="font-weight:650">Ana yönetici</div><div class="muted tiny">kullanıcı adı boş · şifre Cloudflare PANEL_PASSWORD</div></td><td><span class="pill info">Yönetici</span></td><td class="muted small">—</td><td><span class="pill good">Aktif</span></td><td></td></tr>`;
    render($('[data-box]', el), html`<div class="table-wrap"><table class="t"><thead><tr><th>Kullanıcı</th><th>Yetki</th><th>Son giriş</th><th>Durum</th><th></th></tr></thead><tbody>${main}
      ${rows.map((u) => html`<tr data-id="${u.id}"><td><div style="font-weight:650">${u.name}${me.id === u.id ? html` <span class="muted tiny">(siz)</span>` : ''}</div><div class="muted tiny">${u.username}${u.email ? ' · ' + u.email : ''}</div></td>
        <td><span class="pill ${u.role === 'admin' ? 'info' : ''}">${ROLE[u.role] || u.role}</span></td>
        <td class="small" title="${dateTime(u.last_login)}">${u.last_login ? ago(u.last_login) : html`<span class="muted">hiç</span>`}</td>
        <td><span class="pill ${u.active ? 'good' : 'bad'}">${u.active ? 'Aktif' : 'Pasif'}</span></td>
        <td class="r"><button class="btn sm" data-act="edit">Düzenle</button></td></tr>`)}
    </tbody></table></div>${rows.length ? '' : html`<div class="empty">Henüz personel eklenmedi</div>`}`);
  }
  const refresh = async () => { rows = await api('users').catch((e) => { toast(e.message, true); return []; }); draw(); };

  function form(u) {
    const s = sheet({
      title: u ? `${u.name} · düzenle` : 'Yeni kullanıcı', size: 'narrow',
      body: html`<form class="stack" data-f autocomplete="off">
        <label class="field"><span>Ad soyad</span><input class="input" name="name" value="${u ? u.name : ''}" required></label>
        <label class="field"><span>Kullanıcı adı</span><input class="input" name="username" value="${u ? u.username : ''}" ${u ? 'disabled' : ''} required autocapitalize="off"></label>
        <label class="field"><span>E-posta (isteğe bağlı)</span><input class="input" type="email" name="email" value="${u ? u.email || '' : ''}"></label>
        <label class="field"><span>Yetki</span><select class="input" name="role"><option value="staff" ${u && u.role === 'admin' ? '' : 'selected'}>Personel</option><option value="admin" ${u && u.role === 'admin' ? 'selected' : ''}>Yönetici</option></select></label>
        <label class="field"><span>${u ? 'Yeni şifre (değiştirmeyecekseniz boş bırakın)' : 'Şifre (en az 8 karakter)'}</span><input class="input" type="password" name="password" autocomplete="new-password" ${u ? '' : 'required'}></label>
        ${u ? html`<label class="check"><span class="switch"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}><span></span></span> Hesap aktif (kapalıysa giriş yapamaz)</label>` : ''}
      </form>`,
      foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>Kaydet</button>`,
    });
    $('[data-save]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
      const fm = $('[data-f]', s.el);
      if (!fm.reportValidity()) return;
      const b = { name: fm.name.value.trim(), username: fm.username.value.trim(), email: fm.email.value.trim(), role: fm.role.value, password: fm.password.value };
      if (u) b.active = fm.active.checked;
      await api(u ? `users/${u.id}` : 'users', { method: u ? 'PUT' : 'POST', body: b });
      s.close(); toast('Kaydedildi'); refresh();
    });
  }
  // ---------- müşteri panelleri (yalnız ana panel yöneticisi) ----------
  let T = null;
  async function loadTenants() { if (!$('[data-tenants]', el)) return; T = await api('tenants').catch((e) => ({ tenants: [], error: e.message })); drawTenants(); }
  function drawTenants() {
    const box = $('[data-tenants]', el);
    const link = location.origin + '/?firma=';
    render(box, html`<div class="card-pad card-head" style="flex-wrap:wrap;gap:8px"><div style="flex:1;min-width:240px"><h2>Müşteri panelleri</h2>
        <div class="muted small">CRM'i başka firmalara kullandırın: her müşteri kendi API bilgileri, kendi siparişleri, ürünleri ve kullanıcılarıyla tamamen ayrı çalışır. Panel güncellemeleri tüm müşteri panellerine aynı anda gelir. Müşteri giriş ekranında <b>Firma kodu</b> ile girer.</div></div>
      <button class="btn primary" data-act="tadd" ${T && T.ready === false ? 'disabled' : ''}><i class="ico ico-plus"></i>Müşteri paneli oluştur</button></div>
      ${T && T.error ? html`<div class="notice bad small" style="margin:0 16px 12px">${T.error}</div>` : ''}
      ${T && T.ready === false ? html`<div class="notice warn small" style="margin:0 16px 12px"><i class="ico ico-warn"></i><div>Müşteri panelleri için Cloudflare'de Durable Object bağlantısı gerekir; bu sürüm yayınlandığında (wrangler.jsonc) kendiliğinden oluşur.</div></div>` : ''}
      ${T && T.tenants.length ? html`<div class="table-wrap"><table class="t"><thead><tr><th>Firma</th><th>Firma kodu / giriş adresi</th><th>Yönetici</th><th>Oluşturma</th><th>Durum</th><th></th></tr></thead><tbody>
        ${T.tenants.map((t) => html`<tr data-slug="${t.slug}"><td><div style="font-weight:650">${t.name}</div><div class="muted tiny">${[t.email, t.phone].filter(Boolean).join(' · ')}${t.note ? ` · ${t.note}` : ''}</div></td>
          <td><b class="num">${t.slug}</b><div class="tiny"><a class="link" href="${link + t.slug}" target="_blank" rel="noopener">${link + t.slug}</a></div></td>
          <td class="small">${t.admin_username || '—'}</td><td class="small">${date(t.created_at)}</td>
          <td><span class="pill ${t.active ? 'good' : 'bad'}">${t.active ? 'Aktif' : 'Askıda'}</span></td>
          <td class="r"><div class="row" style="justify-content:flex-end;gap:6px"><button class="btn sm" data-act="tinfo">Bilgi</button><button class="btn sm" data-act="tsupport" ${t.active ? '' : 'disabled'} title="Müşteri paneline destek oturumuyla girin (2 saat)">Panele gir</button><button class="btn sm ghost" data-act="tedit">Düzenle</button></div></td></tr>`)}
      </tbody></table></div>` : html`<div class="empty">Henüz müşteri paneli yok</div>`}`);
  }
  const slugOf = (t) => t.closest('[data-slug]').dataset.slug;
  function tenantForm(t) {
    const s = sheet({
      title: t ? `${t.name} · düzenle` : 'Yeni müşteri paneli', size: 'narrow',
      body: html`<form class="stack" data-f autocomplete="off">
        <label class="field"><span>Firma adı</span><input class="input" name="name" value="${t ? t.name : ''}" required></label>
        <label class="field"><span>Firma kodu</span><input class="input" name="slug" value="${t ? t.slug : ''}" ${t ? 'disabled' : ''} required pattern="[a-z0-9][a-z0-9-]{1,30}[a-z0-9]" placeholder="ör. yesil-bahce" autocapitalize="off"><small>Müşteri girişte bunu yazar; küçük harf, rakam, tire. Sonradan değişmez.</small></label>
        ${t ? '' : html`<label class="field"><span>Yönetici kullanıcı adı</span><input class="input" name="admin_username" required autocapitalize="off" placeholder="ör. ali"></label>
        <label class="field"><span>Yönetici şifresi (en az 8 karakter)</span><input class="input" type="password" name="admin_password" autocomplete="new-password" required></label>`}
        <label class="field"><span>E-posta</span><input class="input" type="email" name="email" value="${t ? t.email || '' : ''}"></label>
        <label class="field"><span>Telefon</span><input class="input" name="phone" value="${t ? t.phone || '' : ''}"></label>
        <label class="field"><span>Not (paket, ücret, sözleşme…)</span><input class="input" name="note" value="${t ? t.note || '' : ''}"></label>
        ${t ? html`<label class="check"><span class="switch"><input type="checkbox" name="active" ${t.active ? 'checked' : ''}><span></span></span> Panel aktif (kapalıysa askıya alınır: giriş ve senkron durur, veriler korunur)</label>
          <div class="card stack" style="background:var(--surface-2)"><b class="small">Yönetici şifresini sıfırla</b><div class="row"><input class="input" type="password" name="newpw" placeholder="yeni şifre" autocomplete="new-password"><button class="btn sm" type="button" data-x="pw">Sıfırla</button></div></div>
          <button class="btn sm ghost" type="button" data-x="del" style="color:var(--bad);align-self:flex-start"><i class="ico ico-x"></i>Müşteri panelini ve tüm verisini sil</button>` : ''}
      </form>`,
      foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>Kaydet</button>`,
    });
    const fm = $('[data-f]', s.el);
    $('[data-save]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
      if (!fm.reportValidity()) return;
      const b = { name: fm.name.value.trim(), email: fm.email.value.trim(), phone: fm.phone.value.trim(), note: fm.note.value.trim() };
      if (t) { b.active = fm.active.checked; await api('tenants/' + t.slug, { method: 'PUT', body: b }); }
      else await api('tenants', { method: 'POST', body: { ...b, slug: fm.slug.value.trim().toLocaleLowerCase('tr'), admin_username: fm.admin_username.value.trim(), admin_password: fm.admin_password.value } });
      s.close(); toast(t ? 'Kaydedildi' : `Müşteri paneli oluşturuldu · giriş: ${location.origin}/?firma=${fm.slug.value.trim().toLocaleLowerCase('tr')}`); loadTenants();
    });
    s.el.addEventListener('click', async (e) => {
      const x = e.target.closest('[data-x]');
      if (!x || !t) return;
      if (x.dataset.x === 'pw') busy(x, async () => { await api(`tenants/${t.slug}/password`, { method: 'POST', body: { password: fm.newpw.value } }); fm.newpw.value = ''; toast(`${t.admin_username} şifresi sıfırlandı`); });
      if (x.dataset.x === 'del') {
        const code = prompt(`Bu işlem ${t.name} panelindeki TÜM verileri (siparişler, ürünler, API bilgileri, kullanıcılar) kalıcı olarak siler. Onaylamak için firma kodunu yazın: ${t.slug}`);
        if (code === null) return;
        busy(x, async () => { await api(`tenants/${t.slug}/delete`, { method: 'POST', body: { confirm: code.trim() } }); s.close(); toast('Müşteri paneli silindi'); loadTenants(); });
      }
    });
  }
  actions(el, {
    tadd: () => tenantForm(null),
    tedit: (t) => tenantForm(T.tenants.find((x) => x.slug === slugOf(t))),
    tinfo: (t) => busy(t, async () => {
      const x = T.tenants.find((y) => y.slug === slugOf(t)), st = await api(`tenants/${x.slug}/stats`);
      sheet({ title: x.name, size: 'narrow', body: html`<dl class="kv"><dt>Firma kodu</dt><dd>${x.slug}</dd><dt>Kullanıcı</dt><dd>${n(st.users)}</dd><dt>Bağlı kanal</dt><dd>${n(st.channels)}</dd><dt>Ürün</dt><dd>${n(st.products)}</dd><dt>Sipariş</dt><dd>${n(st.orders)}</dd>
        <dt>Son giriş</dt><dd>${st.last_login ? dateTime(st.last_login) : '—'}</dd><dt>Son sipariş</dt><dd>${st.last_order ? dateTime(st.last_order) : '—'}</dd><dt>Durum</dt><dd>${st.suspended ? 'Askıda' : 'Aktif'}</dd></dl>` });
    }),
    tsupport: async (t) => {
      const x = T.tenants.find((y) => y.slug === slugOf(t));
      if (!(await confirmBox(`${x.name} müşteri paneline destek oturumuyla girilsin mi? Ana panelden çıkış yapılır; dönmek için üstteki “Ana panele dön”e basın.`, 'Panele gir'))) return;
      await api(`tenants/${x.slug}/support`, { method: 'POST' }); location.hash = '#/'; location.reload();
    },
    add: () => form(null),
    edit: (t) => form(rows.find((u) => u.id === Number(t.closest('[data-id]').dataset.id))),
  });
  await Promise.all([refresh(), loadTenants()]);
  return { refresh };
}
