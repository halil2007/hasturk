// Personel ve yetkiler: panele giriş yapacak kişiler, rolleri, bölüm bazlı yetkileri (yok / görür / tam), oturum ve etkinlik takibi.
// Yönetici tüm bölümleri (entegrasyon, personel, ayarlar) yönetir; personel yalnız yetkili olduğu bölümleri görür.
// "Görür" yetkisinde sunucu değişiklik isteklerini reddeder. Ana yönetici Cloudflare'deki PANEL_PASSWORD ile girer.
import { api, state, html, render, $, $$, n, dateTime, ago, actions, busy, toast, sheet, confirmBox, popMenu, debounce, isMobile, ch } from '../core.js';
import { PERMS, ROLE_TEMPLATES } from '../perms.js';

const ROLE = { admin: 'Yönetici', staff: 'Personel' };
const initials = (s) => String(s || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toLocaleUpperCase('tr');
const level = (u, k) => (u.role === 'admin' || !Array.isArray(u.perms) ? 'full' : u.perms.includes(k) ? 'full' : u.perms.includes(k + ':view') ? 'view' : '');
const tplName = (k) => (ROLE_TEMPLATES.find((t) => t[0] === k) || [])[1] || '';
const EV = { accept: 'İşleme aldı', split: 'Pakete böldü', pack: 'Paketledi', ship: 'Kargoya verdi', label: 'Etiket aldı', cancel: 'Paket iptal', repack: 'Yeniden paketledi', cargo: 'Kargo firması değiştirdi', note: 'Not ekledi' };

// Okunabilir, karışmayan karakterlerle güçlü şifre (0/O, 1/l yok)
function genPassword() {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = crypto.getRandomValues(new Uint32Array(12));
  return [...b].map((x, i) => (i === 4 || i === 8 ? '-' : a[x % a.length])).join('');
}

export async function users(el) {
  let rows = [];
  const f = { q: '', st: 'all' };
  render(el, html`<div class="stack">
    <div class="kpis" data-kpis></div>
    <div class="row wrap page-actions">
      <div class="search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Ad, kullanıcı adı, görev, e-posta" data-q></div>
      <span class="spacer"></span>
      <button class="btn primary" data-act="add" data-fab><i class="ico ico-plus"></i>Personel ekle</button>
    </div>
    <div class="card row wrap" data-sec style="gap:12px;align-items:center"></div>
    <div class="tabs" data-tabs></div>
    <div class="card flush" data-box></div>
    <details class="card"><summary><b>Roller ve yetki düzeyleri nasıl çalışır?</b></summary>
      <div class="stack small" style="margin-top:10px">
        <div><b>Yönetici</b> her bölümü görür ve yönetir: entegrasyon (API) bilgileri, personel, ayarlar, geçmiş sipariş aktarımı.</div>
        <div><b>Personel</b> yalnız seçilen bölümleri görür. Her bölüm için üç düzey vardır: <b>Yok</b> (menüde görünmez), <b>Görür</b> (listeler ve ayrıntılar açılır, hiçbir değişiklik yapamaz) ve <b>Tam</b> (işlem yapar).</div>
        <div>Rol şablonları (Depo, Müşteri hizmetleri, Muhasebe …) yetkileri tek dokunuşla doldurur; sonra tek tek değiştirilebilir.</div>
        <div>Pasifleştirilen ya da şifresi değiştirilen hesabın açık oturumları hemen kapanır. “Oturumları kapat” şifreyi değiştirmeden tüm cihazlardan çıkış yaptırır.</div>
        <div class="muted">Kâr bilgisi yalnız “Gelir, gider ve hakediş” yetkisi olanlara gösterilir.</div>
      </div></details>
  </div>`);

  const visible = () => rows.filter((u) => {
    if (f.st === 'active' && !u.active) return false;
    if (f.st === 'passive' && u.active) return false;
    if (f.st === 'admin' && u.role !== 'admin') return false;
    if (f.st === 'staff' && u.role === 'admin') return false;
    const q = f.q.toLocaleLowerCase('tr');
    return !q || [u.name, u.username, u.title, u.email, u.phone].some((x) => String(x || '').toLocaleLowerCase('tr').includes(q));
  });
  const permChips = (u) => {
    if (u.role === 'admin') return html`<span class="muted tiny">Tüm bölümler ve yönetim</span>`;
    if (!Array.isArray(u.perms)) return html`<span class="pill amber" title="Eski hesap: yetki seçilmemiş, tüm bölümleri görür. Düzenleyip yetki seçin.">Tüm bölümler (sınırsız)</span>`;
    const list = PERMS.map(([k, t]) => [t, level(u, k)]).filter(([, l]) => l);
    return list.length ? html`<div class="perm-chips">${list.map(([t, l]) => html`<span class="pc ${l}" title="${l === 'view' ? 'Yalnız görür' : 'Tam yetki'}">${l === 'view' ? html`<i class="ico ico-eye"></i>` : ''}${t}</span>`)}</div>` : html`<span class="muted tiny">Yalnız genel bakış</span>`;
  };
  const avatar = (u) => html`<span class="u-av ${u.role === 'admin' ? 'adm' : ''} ${u.active ? '' : 'off'}">${initials(u.name)}</span>`;
  const lastIn = (u) => (u.last_login ? html`<span title="${dateTime(u.last_login)}${u.last_ip ? ` · IP ${u.last_ip}` : ''}">${ago(u.last_login)}</span>` : html`<span class="muted">hiç girmedi</span>`);

  // Güvenlik: iki adımlı doğrulama herkes için zorunlu mu
  let sec = { require2fa: false };
  function drawSec() {
    const on2 = rows.filter((u) => u.active && u.twofa).length, act = rows.filter((u) => u.active).length;
    render($('[data-sec]', el), html`<i class="ico ico-key" style="color:var(--primary)"></i><div style="flex:1;min-width:220px"><b>İki adımlı doğrulama (Google Authenticator)</b>
        <div class="muted small">${sec.require2fa ? 'Tüm kullanıcılar için zorunlu: açmayan kişi bir sonraki işleminde kurulum ekranını görür.' : 'İsteğe bağlı: her kullanıcı sağ üstteki hesap menüsünden açabilir.'} ${act ? `${on2}/${act} aktif kullanıcıda açık.` : ''}</div></div>
      <label class="switch-row" style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" data-req2 ${sec.require2fa ? 'checked' : ''}><span class="small" style="font-weight:650">Herkes için zorunlu</span></label>`);
    $('[data-req2]', el).onchange = async (e) => {
      const want = e.target.checked;
      if (want && !(state.user || {}).twofa && !(await confirmBox('Zorunlu yapınca siz dahil iki adımlı doğrulamayı açmamış herkes bir sonraki işleminde kurulum ekranına yönlendirilir. Devam edilsin mi?', 'Zorunlu yap'))) { e.target.checked = false; return; }
      sec = await api('users/security', { method: 'PUT', body: { require2fa: want } }).catch((x) => { toast(x.message, true); return sec; });
      toast(sec.require2fa ? 'İki adımlı doğrulama herkes için zorunlu' : 'İki adımlı doğrulama isteğe bağlı');
      drawSec();
      if (sec.require2fa && !(state.user || {}).twofa) setTimeout(() => location.reload(), 900);
    };
  }
  function draw() {
    drawSec();
    const me = state.user || {}, list = visible();
    const act = rows.filter((u) => u.active), week = rows.filter((u) => u.last_login && Date.now() - u.last_login < 7 * 864e5);
    render($('[data-kpis]', el), html`
      <div class="kpi"><div class="label">Toplam personel</div><div class="value num">${n(rows.length)}</div><div class="delta flat">${act.length} aktif · ${rows.length - act.length} pasif</div></div>
      <div class="kpi"><div class="label">Yönetici</div><div class="value num">${n(rows.filter((u) => u.role === 'admin').length + (state.tenant ? 0 : 1))}</div><div class="delta flat">${state.tenant ? 'panel yöneticileri' : 'ana yönetici dahil'}</div></div>
      <div class="kpi"><div class="label">Son 7 günde giriş</div><div class="value num">${n(week.length)}</div><div class="delta flat">kişi</div></div>
      <div class="kpi"><div class="label">Sınırsız eski hesap</div><div class="value num ${rows.some((u) => u.role !== 'admin' && !Array.isArray(u.perms)) ? 'low' : ''}">${n(rows.filter((u) => u.role !== 'admin' && !Array.isArray(u.perms)).length)}</div><div class="delta flat">yetki seçilmemiş</div></div>`);
    const cnt = { all: rows.length, active: act.length, passive: rows.length - act.length, admin: rows.filter((u) => u.role === 'admin').length, staff: rows.filter((u) => u.role !== 'admin').length };
    render($('[data-tabs]', el), html`${[['all', 'Tümü'], ['active', 'Aktif'], ['passive', 'Pasif'], ['admin', 'Yönetici'], ['staff', 'Personel']].map(([k, t]) => html`<button class="tab ${f.st === k ? 'on' : ''}" data-act="st" data-k="${k}">${t}<span class="n">${cnt[k]}</span></button>`)}`);
    const main = state.tenant || f.q || !['all', 'active', 'admin'].includes(f.st) ? null : { id: 0, name: 'Ana yönetici', username: 'kullanıcı adı boş', role: 'admin', active: 1, main: true, twofa: me.id === 0 && !!me.twofa };
    const all = main ? [main, ...list] : list;
    if (isMobile()) {
      render($('[data-box]', el), html`<div class="m-list">${all.map((u) => html`<div class="m-card u-card" data-id="${u.id}">
          <div class="row">${avatar(u)}<div style="min-width:0;flex:1"><div class="ellipsis" style="font-weight:700">${u.name}${me.id === u.id && !u.main ? html` <span class="muted tiny">(siz)</span>` : ''}</div><div class="muted tiny ellipsis">${u.title ? u.title + ' · ' : ''}${u.main ? 'şifre: Cloudflare PANEL_PASSWORD' : u.username}</div></div>
            ${u.main ? '' : html`<button class="icon-btn sm" data-act="menu" aria-label="İşlemler"><i class="ico ico-dots"></i></button>`}</div>
          <div class="row wrap" style="gap:6px"><span class="pill ${u.role === 'admin' ? 'info' : ''}">${ROLE[u.role]}</span>${u.template ? html`<span class="pill">${tplName(u.template)}</span>` : ''}<span class="pill ${u.active ? 'good' : 'bad'}">${u.active ? 'Aktif' : 'Pasif'}</span>${u.twofa ? html`<span class="pill good">2 adımlı</span>` : ''}${u.main ? '' : html`<span class="muted tiny" style="margin-left:auto">${lastIn(u)}</span>`}</div>
          ${u.main ? '' : permChips(u)}
        </div>`)}${all.length ? '' : html`<div class="empty">Kayıt yok</div>`}</div>`);
      return;
    }
    render($('[data-box]', el), html`<div class="table-wrap"><table class="t"><thead><tr><th>Kişi</th><th>Rol</th><th>Yetkiler</th><th>Son giriş</th><th>Durum</th><th></th></tr></thead><tbody>
      ${all.map((u) => html`<tr data-id="${u.id}" class="${u.main ? '' : 'click'}">
        <td><div class="row">${avatar(u)}<div style="min-width:0"><div style="font-weight:650">${u.name}${me.id === u.id && !u.main ? html` <span class="muted tiny">(siz)</span>` : ''}</div>
          <div class="muted tiny">${u.main ? 'kullanıcı adı boş · şifre Cloudflare PANEL_PASSWORD' : [u.title, u.username, u.email, u.phone].filter(Boolean).join(' · ')}</div></div></div></td>
        <td><span class="pill ${u.role === 'admin' ? 'info' : ''}">${ROLE[u.role]}</span>${u.template && u.role !== 'admin' ? html`<div class="muted tiny" style="margin-top:3px">${tplName(u.template)}</div>` : ''}</td>
        <td style="max-width:420px">${u.main ? html`<span class="muted tiny">Tüm bölümler ve yönetim</span>` : permChips(u)}</td>
        <td class="small">${u.main ? html`<span class="muted">—</span>` : lastIn(u)}</td>
        <td><span class="pill ${u.active ? 'good' : 'bad'}">${u.active ? 'Aktif' : 'Pasif'}</span>${u.twofa ? html`<div class="tiny" style="margin-top:3px;color:var(--good)" title="İki adımlı doğrulama açık"><i class="ico ico-key" style="width:12px;height:12px;vertical-align:-1px"></i> 2 adımlı</div>` : ''}</td>
        <td class="r">${u.main ? '' : html`<div class="row" style="justify-content:flex-end;gap:4px"><button class="btn sm" data-act="edit">Düzenle</button><button class="icon-btn sm" data-act="menu" aria-label="İşlemler"><i class="ico ico-dots"></i></button></div>`}</td></tr>`)}
    </tbody></table></div>${all.length ? '' : html`<div class="empty">${rows.length ? 'Bu filtrede kayıt yok' : 'Henüz personel eklenmedi'}</div>`}`);
  }
  const refresh = async () => {
    [rows, sec] = await Promise.all([api('users', { fresh: true }).catch((e) => { toast(e.message, true); return []; }), api('users/security', { fresh: true }).catch(() => sec)]);
    draw();
  };

  // ---------- form ----------
  function form(u) {
    const s = sheet({
      title: u ? `${u.name} · düzenle` : 'Yeni personel', size: 'wide',
      body: html`<form class="stack" data-f autocomplete="off">
        <div class="card"><h3 style="margin-bottom:10px">Kişi bilgileri</h3><div class="form-grid">
          <label class="field"><span>Ad soyad *</span><input class="input" name="name" value="${u ? u.name : ''}" required></label>
          <label class="field"><span>Görev / unvan</span><input class="input" name="title" value="${u ? u.title || '' : ''}" placeholder="ör. Depo sorumlusu" list="u-titles"></label>
          <label class="field"><span>Kullanıcı adı *</span><input class="input" name="username" value="${u ? u.username : ''}" ${u ? 'disabled' : ''} required autocapitalize="none" placeholder="ör. ayse.k"><small>${u ? 'Kullanıcı adı değiştirilemez' : 'Girişte kullanılır (harf, rakam, . _ -)'}</small></label>
          <label class="field"><span>E-posta</span><input class="input" type="email" name="email" value="${u ? u.email || '' : ''}"></label>
          <label class="field"><span>Telefon</span><input class="input" type="tel" name="phone" value="${u ? u.phone || '' : ''}"></label>
        </div><datalist id="u-titles">${['Depo sorumlusu', 'Sevkiyat', 'Müşteri hizmetleri', 'Pazaryeri uzmanı', 'Muhasebe', 'Katalog sorumlusu', 'Mağaza müdürü'].map((t) => html`<option value="${t}">`)}</datalist></div>

        <div class="card"><h3 style="margin-bottom:10px">Giriş</h3>
          <label class="field"><span>${u ? 'Yeni şifre (değiştirmeyecekseniz boş bırakın)' : 'Şifre * (en az 8 karakter)'}</span>
            <span class="row"><span class="pw" style="flex:1"><input class="input" type="password" name="password" autocomplete="new-password" ${u ? '' : 'required'}><button type="button" class="icon-btn sm" data-x="eye" aria-label="Göster"><i class="ico ico-eye"></i></button></span>
            <button type="button" class="btn" data-x="gen"><i class="ico ico-key"></i>Oluştur</button></span>
            <small data-pwinfo>Oluşturulan şifreyi kişiye iletin; ilk girişten sonra Hesap → Şifremi değiştir ile değiştirebilir.</small></label>
          ${u ? html`<label class="check" style="margin-top:8px"><span class="switch"><input type="checkbox" name="active" ${u.active ? 'checked' : ''} ${state.user && state.user.id === u.id ? 'disabled' : ''}><span></span></span> Hesap aktif (kapalıysa giriş yapamaz, açık oturumları kapanır)</label>` : ''}
        </div>

        <div class="card"><h3 style="margin-bottom:10px">Rol</h3>
          <div class="role-pick">
            <label><input type="radio" name="role" value="staff" ${u && u.role === 'admin' ? '' : 'checked'}><span><b>Personel</b><small>Yalnız aşağıda seçilen bölümler</small></span></label>
            <label><input type="radio" name="role" value="admin" ${u && u.role === 'admin' ? 'checked' : ''} ${state.user && u && state.user.id === u.id ? 'disabled' : ''}><span><b>Yönetici</b><small>Her şey: API bilgileri, personel, ayarlar</small></span></label>
          </div>
          <div data-perms ${u && u.role === 'admin' ? 'hidden' : ''}>
            <div class="small" style="font-weight:650;margin:14px 0 6px">Rol şablonu</div>
            <div class="chips wrap-chips">${ROLE_TEMPLATES.map(([k, t]) => html`<button type="button" class="chip ${u && u.template === k ? 'on' : ''}" data-tpl="${k}">${t}</button>`)}<button type="button" class="chip ${u && !u.template ? 'on' : ''}" data-tpl="">Özel</button></div>
            <div class="small" style="font-weight:650;margin:14px 0 6px">Bölüm yetkileri</div>
            <div class="perm-grid">${PERMS.map(([k, t, d]) => html`<div class="perm-row"><div style="min-width:0"><b>${t}</b><div class="muted tiny">${d}</div></div>
              <div class="seg" data-perm="${k}">${[['', 'Yok'], ['view', 'Görür'], ['full', 'Tam']].map(([v, l]) => html`<button type="button" data-v="${v}" class="${(u ? level(u, k) : '') === v ? 'on' : ''}">${l}</button>`)}</div></div>`)}</div>
            <div class="muted tiny" style="margin-top:8px">Genel Bakış, bildirimler ve kendi şifresi her zaman açıktır. Entegrasyon, personel ve ayarlar yalnız yöneticidedir.</div>
          </div>
        </div>
        <div class="card"><label class="field"><span>Not (yalnız yöneticiler görür)</span><textarea class="input" name="note" rows="2" placeholder="ör. vardiya, izin, sorumlu olduğu mağaza">${u ? u.note || '' : ''}</textarea></label></div>
      </form>`,
      foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>${u ? 'Kaydet' : 'Personeli ekle'}</button>`,
    });
    const fm = $('[data-f]', s.el);
    let tpl = u ? u.template || '' : '';
    const setLevel = (k, v) => $$(`[data-perm="${k}"] button`, s.el).forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    s.el.addEventListener('click', (e) => {
      const seg = e.target.closest('[data-perm] button');
      if (seg) { setLevel(seg.parentElement.dataset.perm, seg.dataset.v); tpl = ''; $$('[data-tpl]', s.el).forEach((c) => c.classList.toggle('on', c.dataset.tpl === '')); return; }
      const t = e.target.closest('[data-tpl]');
      if (t) {
        tpl = t.dataset.tpl;
        $$('[data-tpl]', s.el).forEach((c) => c.classList.toggle('on', c === t));
        const def = (ROLE_TEMPLATES.find((x) => x[0] === tpl) || [])[2];
        if (def) PERMS.forEach(([k]) => setLevel(k, def.includes(k) ? 'full' : def.includes(k + ':view') ? 'view' : ''));
        return;
      }
      const x = e.target.closest('[data-x]');
      if (x && x.dataset.x === 'gen') { const p = genPassword(); fm.password.value = p; fm.password.type = 'text'; $('[data-pwinfo]', s.el).innerHTML = ''; $('[data-pwinfo]', s.el).append('Oluşturulan şifre: ', Object.assign(document.createElement('b'), { textContent: p }), ' — kaydetmeden önce kişiye iletin.'); navigator.clipboard && navigator.clipboard.writeText(p).then(() => toast('Şifre panoya kopyalandı')).catch(() => {}); }
      if (x && x.dataset.x === 'eye') fm.password.type = fm.password.type === 'password' ? 'text' : 'password';
    });
    $$('[name=role]', s.el).forEach((r) => (r.onchange = () => { $('[data-perms]', s.el).hidden = fm.role.value === 'admin'; }));
    $('[data-save]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
      if (!fm.reportValidity()) return;
      const b = { name: fm.name.value.trim(), title: fm.title.value.trim(), username: fm.username.value.trim(), email: fm.email.value.trim(), phone: fm.phone.value.trim(), role: fm.role.value, password: fm.password.value, note: fm.note.value.trim(), template: tpl };
      if (b.role !== 'admin') {
        b.perms = $$('[data-perm]', s.el).map((g) => { const v = ($('button.on', g) || {}).dataset; const lv = v ? v.v : ''; return lv === 'full' ? g.dataset.perm : lv === 'view' ? g.dataset.perm + ':view' : null; }).filter(Boolean);
        if (!b.perms.length && !(await confirmBox('Hiçbir bölüm seçilmedi; bu kişi yalnız Genel Bakış\'ı görür. Devam edilsin mi?', 'Devam et'))) return;
      }
      if (u) b.active = fm.active ? fm.active.checked : true;
      await api(u ? `users/${u.id}` : 'users', { method: u ? 'PUT' : 'POST', body: b });
      s.close(); toast(u ? 'Kaydedildi' : `${b.name} eklendi · kullanıcı adı: ${b.username}`); refresh();
    });
  }

  // ---------- etkinlik ----------
  async function activity(u) {
    const s = sheet({ title: `${u.name} · etkinlik`, size: 'narrow', body: html`<div class="empty"><i class="ico ico-sync spin"></i></div>` });
    try {
      const a = await api(`users/${u.id}/activity`, { fresh: true });
      s.setBody(html`<dl class="kv" style="margin-bottom:14px"><dt>Son giriş</dt><dd>${u.last_login ? dateTime(u.last_login) : '—'}</dd>${u.last_ip ? html`<dt>Son giriş IP</dt><dd class="num">${u.last_ip}</dd>` : ''}<dt>Hesap açılışı</dt><dd>${u.created_at ? dateTime(u.created_at) : '—'}</dd><dt>Son 30 gün sipariş işlemi</dt><dd>${n(a.count30)}</dd></dl>
        <h3 style="margin-bottom:8px">Sipariş işlemleri</h3>
        ${a.orders.length ? html`<div class="timeline">${a.orders.map((x) => html`<div class="ev"><span class="dot"></span><div style="flex:1;min-width:0"><div><b>${EV[x.action] || x.action}</b>${x.order_number ? html` · <a class="link" href="#/siparisler/${encodeURIComponent(x.order_id)}">#${x.order_number}</a>` : ''}${x.channel ? html` <span class="muted tiny">${ch(x.channel).name}</span>` : ''}</div><div class="muted tiny">${dateTime(x.at)}${x.note ? ` · ${x.note}` : ''}</div></div></div>`)}</div>` : html`<div class="muted small">Kayıt yok</div>`}
        ${a.logs.length ? html`<h3 style="margin:16px 0 8px">Diğer işlemler</h3><div class="timeline">${a.logs.map((x) => html`<div class="ev"><span class="dot"></span><div style="flex:1;min-width:0"><div class="small">${String(x.msg).replace(/^[^:]+:\s*/, '')}</div><div class="muted tiny">${dateTime(x.at)}</div></div></div>`)}</div>` : ''}`);
    } catch (e) { s.setBody(html`<div class="notice bad">${e.message}</div>`); }
  }

  const userOf = (t) => rows.find((u) => u.id === Number(t.closest('[data-id]').dataset.id));
  function menu(t) {
    const u = userOf(t), me = state.user || {};
    if (!u) return;
    popMenu(t, [
      { icon: 'gear', label: 'Düzenle', run: () => form(u) },
      { icon: 'orders', label: 'Etkinlik ve son işlemler', run: () => activity(u) },
      { icon: 'key', label: 'Yeni şifre oluştur', run: async () => {
        const p = genPassword();
        if (!(await confirmBox(`${u.name} için yeni şifre oluşturulsun mu? Açık oturumları kapanır. Yeni şifre: ${p}`, 'Şifreyi değiştir'))) return;
        await api(`users/${u.id}`, { method: 'PUT', body: { ...u, password: p, active: !!u.active } }).then(() => { navigator.clipboard && navigator.clipboard.writeText(p).catch(() => {}); toast(`Yeni şifre: ${p} (panoya kopyalandı)`); }).catch((e) => toast(e.message, true));
      } },
      ...(u.twofa ? [{ icon: 'key', label: 'İki adımlı doğrulamayı sıfırla', run: async () => { if (await confirmBox(`${u.name} telefonunu kaybettiyse iki adımlı doğrulaması sıfırlanır ve oturumları kapanır. Bir sonraki girişte ${sec.require2fa ? 'yeniden kurması istenir' : 'yalnız şifreyle girer'}.`, 'Sıfırla')) api(`users/${u.id}/2fa-reset`, { method: 'POST' }).then(() => { toast('Sıfırlandı'); refresh(); }).catch((e) => toast(e.message, true)); } }] : []),
      { icon: 'x', label: 'Tüm cihazlardan çıkış yaptır', run: async () => { if (await confirmBox(`${u.name} tüm cihazlarda oturumdan çıkarılsın mı? Şifresi değişmez, tekrar giriş yapabilir.`, 'Çıkış yaptır')) api(`users/${u.id}/revoke`, { method: 'POST' }).then(() => toast('Oturumlar kapatıldı')).catch((e) => toast(e.message, true)); } },
      ...(me.id !== u.id ? [{ icon: u.active ? 'minus' : 'check', label: u.active ? 'Pasifleştir (giriş yapamaz)' : 'Aktifleştir', run: () => api(`users/${u.id}`, { method: 'PUT', body: { ...u, active: !u.active } }).then(() => { toast(u.active ? 'Hesap pasifleştirildi' : 'Hesap aktifleştirildi'); refresh(); }).catch((e) => toast(e.message, true)) },
        '-', { icon: 'x', label: 'Personeli sil', danger: true, run: async () => { if (await confirmBox(`${u.name} kalıcı olarak silinsin mi? Geçmiş işlem kayıtlarında adı kalır. Geçici ayrılıklar için “Pasifleştir” daha uygundur.`, 'Sil')) api(`users/${u.id}`, { method: 'DELETE' }).then(() => { toast('Silindi'); refresh(); }).catch((e) => toast(e.message, true)); } }] : []),
    ], { title: u.name });
  }

  actions(el, {
    add: () => form(null),
    edit: (t) => form(userOf(t)),
    menu: (t) => menu(t),
    st: (t) => { f.st = t.dataset.k; draw(); },
  });
  el.addEventListener('click', (e) => {
    const r = e.target.closest('[data-id]');
    if (!r || e.target.closest('button, a, input') || r.dataset.id === '0') return;
    const u = userOf(r);
    if (u) form(u);
  });
  $('[data-q]', el).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); draw(); }, 200));
  await refresh();
  return { refresh };
}
