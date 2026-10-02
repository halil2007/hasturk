// Kullanıcılar: panele giriş yapacak personel. Yönetici tüm bölümleri (entegrasyon, kullanıcı, ayar) yönetir;
// personel siparişleri, kargoyu, ürün ve stokları kullanır. Ana yönetici Cloudflare'deki PANEL_PASSWORD ile girer.
import { api, state, html, render, $, dateTime, ago, actions, busy, toast, sheet } from '../core.js';

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
  </div>`);

  function draw() {
    const me = state.user || {};
    const main = html`<tr><td><div style="font-weight:650">Ana yönetici</div><div class="muted tiny">kullanıcı adı boş · şifre Cloudflare PANEL_PASSWORD</div></td><td><span class="pill info">Yönetici</span></td><td class="muted small">—</td><td><span class="pill good">Aktif</span></td><td></td></tr>`;
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
  actions(el, {
    add: () => form(null),
    edit: (t) => form(rows.find((u) => u.id === Number(t.closest('[data-id]').dataset.id))),
  });
  await refresh();
  return { refresh };
}
