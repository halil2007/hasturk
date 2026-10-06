// Destek: firma sorun / soru / öneri bildirir (ekran görüntüsüyle); ana panel tüm firmaların taleplerini görür ve yanıtlar.
// openTicketForm: her yerden açılan "Sorun bildir" penceresi (hata mesajından gelirse hata ve sayfa bilgisi kendiliğinden eklenir).
import { api, state, html, render, $, $$, ago, dateTime, actions, busy, toast, sheet } from '../core.js';

const CAT = { bug: ['Hata / sorun', 'warn'], question: ['Soru', 'chat'], request: ['Öneri / istek', 'plus'], billing: ['Abonelik / ödeme', 'calc'] };
const ST = { open: ['warn', 'Yanıt bekliyor'], answered: ['good', 'Yanıtlandı'], closed: ['', 'Kapandı'] };
const staffView = () => !state.tenant;

// Görseli tarayıcıda küçült (en uzun kenar 1600 px, JPEG) → data URL
async function shrink(file) {
  if (!/^image\//.test(file.type)) throw new Error('Yalnız görsel eklenebilir');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Görsel okunamadı')); i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return { name: (file.name || 'ekran-goruntusu').replace(/\.\w+$/, '') + '.jpg', data: c.toDataURL('image/jpeg', 0.82) };
  } finally { URL.revokeObjectURL(url); }
}
// Görsel ekleme alanı: seç, sürükle-bırak ya da Ctrl+V ile yapıştır (en fazla 4)
function attacher(root) {
  const list = [];
  const box = $('[data-files]', root), input = $('[data-file]', root);
  const draw = () => render(box, html`${list.map((f, i) => html`<span class="sp-thumb"><img src="${f.data}" alt=""><button type="button" data-rm="${i}" title="Kaldır"><i class="ico ico-x"></i></button></span>`)}`);
  const add = async (files) => {
    for (const f of files) {
      if (list.length >= 4) { toast('En fazla 4 görsel eklenebilir', true); break; }
      try { list.push(await shrink(f)); } catch (e) { toast(e.message, true); }
    }
    draw();
  };
  input.addEventListener('change', () => { add([...input.files]); input.value = ''; });
  box.addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { list.splice(Number(b.dataset.rm), 1); draw(); } });
  root.addEventListener('paste', (e) => { const fs = [...(e.clipboardData || {}).items || []].filter((x) => x.kind === 'file').map((x) => x.getAsFile()).filter(Boolean); if (fs.length) { e.preventDefault(); add(fs); } });
  root.addEventListener('dragover', (e) => { e.preventDefault(); });
  root.addEventListener('drop', (e) => { e.preventDefault(); add([...(e.dataTransfer || {}).files || []]); });
  return list;
}
const fileField = html`<div class="field"><span>Ekran görüntüsü <span class="muted tiny">(isteğe bağlı · en fazla 4 · Ctrl+V ile yapıştırabilirsiniz)</span></span>
  <div class="row wrap" style="gap:8px;align-items:center"><label class="btn sm"><i class="ico ico-image"></i>Görsel ekle<input type="file" accept="image/*" multiple data-file hidden></label><div class="row wrap" style="gap:8px" data-files></div></div></div>`;

// Teknik bağlam: sayfa, tarayıcı, ekran, son hata (yalnız destek ekibi görür)
const context = (extra = {}) => ({ url: location.hash, browser: navigator.userAgent, screen: `${innerWidth}×${innerHeight}`, at: new Date().toISOString(), user: state.user && state.user.name, ...extra });

export function openTicketForm({ category = 'bug', subject = '', body = '', error = '' } = {}) {
  const s = sheet({
    title: 'Destek talebi', size: 'narrow',
    body: html`<form class="stack" data-tf>
      <div class="muted small">Sorununuzu ya da sorunuzu yazın; ekibimiz kontrol edip bu panelden yanıt verir. Yanıt gelince <b>Destek</b> menüsünde görürsünüz.</div>
      <div class="field"><span>Konu türü</span><div class="row wrap" style="gap:6px" data-cat>${Object.entries(CAT).map(([k, [t, i]]) => html`<button type="button" class="chip ${k === category ? 'on' : ''}" data-k="${k}"><i class="ico ico-${i}"></i>${t}</button>`)}</div></div>
      <label class="field"><span>Konu</span><input class="input" name="subject" maxlength="140" required value="${subject}" placeholder="ör. Hepsiburada etiketi basılmıyor"></label>
      <label class="field"><span>Açıklama</span><textarea class="input" name="body" rows="6" required placeholder="Ne yapmaya çalışıyordunuz? Ne oldu? Ne olmasını bekliyordunuz? (Sipariş no, ürün adı gibi bilgileri ekleyin)">${body}</textarea></label>
      ${fileField}
      ${error ? html`<div class="notice small"><i class="ico ico-warn"></i><div><b>Talebe eklenecek hata:</b> ${error}</div></div>` : ''}
      <div class="tiny muted">Talebe açık olduğunuz sayfa, tarayıcı ve saat bilgisi de eklenir (sorunu daha hızlı bulmamız için).</div>
    </form>`,
    foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-send><i class="ico ico-send"></i>Gönder</button>`,
  });
  const f = $('[data-tf]', s.el), files = attacher(s.el);
  let cat = category;
  $('[data-cat]', s.el).addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; cat = b.dataset.k; $$('[data-cat] .chip', s.el).forEach((x) => x.classList.toggle('on', x === b)); });
  setTimeout(() => (subject ? f.body : f.subject).focus(), 60);
  $('[data-send]', s.el).onclick = (e) => busy(e.currentTarget, async () => {
    if (!f.reportValidity()) return;
    const r = await api('support', { method: 'POST', body: { subject: f.subject.value.trim(), category: cat, body: f.body.value.trim(), page: location.hash.replace(/^#\/?/, '').split('?')[0] || 'genel-bakis', context: context(error ? { error } : {}), files } });
    s.close(); toast('Talebiniz alındı; yanıt gelince Destek menüsünde görünür');
    if (location.hash.startsWith('#/destek')) location.hash = '#/destek/' + r.id;
  });
}

export async function supportView(el, rest = []) {
  const id = rest[0];
  const staff = staffView();
  let f = { status: '' };
  const img = (fl) => html`<a class="sp-img" href="/api/support/file/${fl.id}" target="_blank" rel="noopener" title="${fl.name}"><img src="/api/support/file/${fl.id}" alt="${fl.name}" loading="lazy"></a>`;
  async function list() {
    const d = await api('support' + (f.status ? `?status=${f.status}` : ''), { fresh: true });
    const c = d.counts || {}, total = Object.values(c).reduce((a, x) => a + x, 0);
    render(el, html`<div class="stack">
      <div class="card row wrap" style="gap:12px;align-items:center">
        <div style="flex:1;min-width:240px"><h2>${staff ? 'Destek talepleri' : 'Destek'}</h2><div class="muted small">${staff ? 'Firmaların bildirdiği sorunlar ve sorular. Yanıtınız firmanın panelinde görünür.' : 'Bir sorun mu var ya da sorunuz mu? Talep açın, ekran görüntüsü ekleyin; ekibimiz bu panelden yanıt verir.'}</div></div>
        ${staff ? '' : html`<button class="btn primary" data-act="new"><i class="ico ico-plus"></i>Yeni talep</button>`}
      </div>
      <div class="tabs">${[['', 'Tümü', total], ['open', 'Yanıt bekleyen', c.open || 0], ['answered', 'Yanıtlanan', c.answered || 0], ['closed', 'Kapanan', c.closed || 0]].map(([k, t, n2]) => html`<button class="tab ${f.status === k ? 'on' : ''}" data-act="st" data-k="${k}">${t} <span class="n">${n2}</span></button>`)}</div>
      ${d.tickets.length ? html`<div class="card flush sp-list">${d.tickets.map((t) => { const s2 = ST[t.status] || ['', t.status], unread = staff ? t.unread_admin && t.status !== 'closed' : t.unread_user; return html`<a class="sp-row ${unread ? 'unread' : ''}" href="#/destek/${t.id}">
        <span class="sp-ic ${t.category}"><i class="ico ico-${(CAT[t.category] || CAT.bug)[1]}"></i></span>
        <div style="flex:1;min-width:0"><div class="row" style="gap:8px"><b class="ellipsis">${t.subject}</b>${unread ? html`<span class="pill info tiny">${staff ? 'yeni' : 'yeni yanıt'}</span>` : ''}</div>
          <div class="tiny muted">${staff ? html`<b>${t.firm || 'Ana panel'}</b> · ` : ''}${(CAT[t.category] || CAT.bug)[0]} · ${t.user_name || ''} · #${t.id} · ${t.messages} mesaj${t.files ? ` · ${t.files} görsel` : ''}</div></div>
        <div class="r" style="display:grid;gap:4px;justify-items:end"><span class="pill ${s2[0]}">${s2[1]}</span><span class="tiny muted" title="${dateTime(t.updated_at)}">${ago(t.updated_at)}</span></div></a>`; })}</div>`
        : html`<div class="card empty">${staff ? 'Henüz destek talebi yok' : html`Açık talebiniz yok. Bir sorun yaşarsanız <b>Yeni talep</b>'e basın.`}</div>`}
    </div>`);
  }
  async function detail() {
    const d = await api('support/' + id, { fresh: true });
    const t = d.ticket, s2 = ST[t.status] || ['', t.status], cx = t.context || {};
    render(el, html`<div class="stack">
      <div class="row wrap" style="gap:10px"><a class="btn ghost sm" href="#/destek"><i class="ico ico-back"></i>Destek</a><span class="spacer"></span>
        ${t.status === 'closed' ? html`<button class="btn sm" data-act="status" data-k="open">Yeniden aç</button>` : html`<button class="btn sm" data-act="status" data-k="closed"><i class="ico ico-check"></i>${staff ? 'Talebi kapat' : 'Sorun çözüldü, kapat'}</button>`}</div>
      <div class="sp-detail">
        <div class="card stack" style="min-width:0">
          <div><div class="row wrap" style="gap:8px"><h2 style="margin:0">${t.subject}</h2><span class="pill ${s2[0]}">${s2[1]}</span></div>
            <div class="tiny muted">#${t.id} · ${(CAT[t.category] || CAT.bug)[0]} · ${staff ? `${t.firm || 'Ana panel'} · ` : ''}${dateTime(t.created_at)}</div></div>
          <div class="sp-thread">${d.messages.map((m) => html`<div class="sp-msg ${m.admin ? 'staff' : ''}"><div class="sp-meta"><b>${m.author}</b><span class="tiny muted">${dateTime(m.created_at)}</span></div>
            ${m.body ? html`<div class="sp-body">${m.body}</div>` : ''}${m.files.length ? html`<div class="row wrap" style="gap:8px;margin-top:6px">${m.files.map(img)}</div>` : ''}</div>`)}</div>
          <form class="stack sp-reply" data-rf>
            <textarea class="input" name="body" rows="3" placeholder="${staff ? 'Yanıtınızı yazın…' : 'Ek bilgi ya da yanıt yazın…'}"></textarea>
            ${fileField}
            <div class="row"><span class="spacer"></span><button class="btn primary" type="button" data-act="reply"><i class="ico ico-send"></i>${staff ? 'Yanıtla' : 'Gönder'}</button></div>
          </form>
        </div>
        ${staff ? html`<aside class="card stack small"><h3 style="margin:0">Talep bilgileri</h3>
          <dl class="id-kv"><dt>Firma</dt><dd>${t.firm || 'Ana panel'}${t.slug ? html`<div class="tiny muted">${t.slug}</div>` : ''}</dd><dt>Kullanıcı</dt><dd>${t.user_name || '—'}</dd><dt>Sayfa</dt><dd>${t.page || '—'}</dd><dt>Ekran</dt><dd>${cx.screen || '—'}</dd><dt>Saat</dt><dd>${cx.at ? dateTime(Date.parse(cx.at)) : '—'}</dd></dl>
          ${cx.error ? html`<div class="notice bad small"><div><b>Hata:</b> ${cx.error}</div></div>` : ''}
          ${cx.browser ? html`<div class="tiny muted" style="word-break:break-word">${cx.browser}</div>` : ''}
          ${t.slug ? html`<a class="btn sm outline" href="#/firmalar">Firmayı aç</a>` : ''}</aside>` : ''}
      </div>
    </div>`);
    const files = attacher($('[data-rf]', el));
    el._files = files;
    const th = $('.sp-thread', el); if (th) th.scrollTop = th.scrollHeight;
    // Okundu: menü rozeti güncellensin
    refreshCount();
  }
  actions(el, {
    new: () => openTicketForm(),
    st: (b) => { f.status = b.dataset.k; list(); },
    reply: (b) => busy(b, async () => {
      const form = $('[data-rf]', el), body = form.body.value.trim();
      if (!body && !(el._files || []).length) return toast('Mesaj yazın ya da görsel ekleyin', true);
      await api(`support/${id}/reply`, { method: 'POST', body: { body, files: el._files || [] } });
      toast(staff ? 'Yanıt gönderildi' : 'Mesajınız iletildi'); await detail();
    }),
    status: (b) => busy(b, async () => { await api(`support/${id}/status`, { method: 'POST', body: { status: b.dataset.k } }); toast(b.dataset.k === 'closed' ? 'Talep kapatıldı' : 'Talep yeniden açıldı'); await detail(); }),
  });
  await (id ? detail() : list());
  return { refresh: id ? detail : list };
}

// Menü rozeti: yanıt bekleyen (ana panel) / okunmamış yanıt (firma) sayısı
export async function refreshCount() {
  try { const r = await api('support/count', { fresh: true }); state.supportCount = r.n || 0; } catch { /* destek kapalı */ }
  $$('[data-count="support"]').forEach((x) => { const v = state.supportCount || 0; x.textContent = v > 99 ? '99+' : v; x.classList.toggle('hide', !v); });
}
