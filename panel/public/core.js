// Ortak arayüz yardımcıları: API, güvenli HTML şablonu, biçimlendirme, kanal rozetleri, bildirim, alt pencere, menü.

export const state = { channels: [], settings: null, summary: null, demo: false, user: null, onLogin: null };
// Beklemedeki (pasif) kanallar listelerde gösterilmez; Entegrasyonlar sayfası hepsini gösterir
export const activeChannels = () => state.channels.filter((c) => !c.paused);
export const isAdmin = () => !state.user || state.user.role === 'admin';

// ---------- API ----------
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api/' + path, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin',
  });
  let data = {};
  try { data = await res.json(); } catch { /* boş */ }
  if (res.status === 401 && path !== 'login') { state.onLogin && state.onLogin(data); throw new Error(data.error || 'Giriş gerekli'); }
  if (!res.ok) throw new Error(data.error || `Hata (${res.status})`);
  return data;
}

// ---------- HTML şablonu (değerler her zaman kaçışlanır; raw() ile işaretlenen hariç) ----------
const RAW = Symbol('raw');
export const raw = (s) => ({ [RAW]: true, s: String(s) });
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function val(v) {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(val).join('');
  if (typeof v === 'object' && v[RAW]) return v.s;
  return esc(v);
}
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += val(values[i]) + strings[i + 1];
  return raw(out);
}
export const render = (el, tpl) => { el.innerHTML = tpl && tpl.s !== undefined ? tpl.s : tpl || ''; return el; };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// data-act="..." tıklamalarını tek yerden yakala (en içteki eylem çalışır)
export function actions(root, map) {
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t || !root.contains(t) || !map[t.dataset.act]) return;
    e.preventDefault();
    map[t.dataset.act](t, e);
  });
}

// ---------- biçimlendirme ----------
const tl = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2, minimumFractionDigits: 2 });
const tl0 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
const nf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
export const money = (v) => tl.format(Number(v) || 0);
export const money0 = (v) => tl0.format(Math.round(Number(v) || 0));
export const n = (v) => nf.format(Number(v) || 0);
export function compact(v) {
  v = Number(v) || 0;
  const a = Math.abs(v);
  if (a >= 1e6) return nf.format(v / 1e6) + ' Mn';
  if (a >= 1e4) return nf.format(v / 1e3) + ' B';
  return nf.format(Math.round(v));
}
export const pct = (v) => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}%${nf.format(v)}`);
export const delta = (cur, prev) => (prev ? ((cur - prev) / Math.abs(prev)) * 100 : cur ? null : 0);
const tz = { timeZone: 'Europe/Istanbul' };
const dtf = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...tz });
const df = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', ...tz });
const hm = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', ...tz });
const dm = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', ...tz });
export const dateTime = (ms) => (ms ? dtf.format(new Date(ms)) : '');
export const date = (ms) => (ms ? df.format(new Date(ms)) : '');
export const shortDT = (ms) => (ms ? `${dm.format(new Date(ms))}, ${hm.format(new Date(ms))}` : '');
export function ago(ms) {
  if (!ms) return '';
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'az önce';
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} gün önce`;
  return date(ms);
}
// Türkiye saatine göre YYYY-MM-DD
export const dayKey = (ms = Date.now()) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);
export const numIn = (v) => { const x = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };
export const rangeLabel = (from, to) => {
  const f = new Date(from + 'T12:00:00Z'), t = new Date(to + 'T12:00:00Z');
  const o = { day: 'numeric', month: 'long', timeZone: 'UTC' };
  if (from === to) return f.toLocaleDateString('tr-TR', { ...o, year: 'numeric' });
  if (from.slice(0, 7) === to.slice(0, 7)) return `${f.getUTCDate()} – ${t.toLocaleDateString('tr-TR', { ...o, year: 'numeric' })}`;
  return `${f.toLocaleDateString('tr-TR', o)} – ${t.toLocaleDateString('tr-TR', { ...o, year: 'numeric' })}`;
};

// Kargo gecikme uyarısı: kanalın son kargoya teslim tarihi (varsa) ve sipariş yaşı (1 günü aşan) dikkate alınır
export function lateInfo(o, now = Date.now()) {
  if (!['new', 'processing'].includes(o.status) || (o.open_packages === 0 && o.packages > 0)) return null;
  const H = 3600e3;
  if (o.ship_by && now > o.ship_by) return { cls: 'bad', text: 'Gecikti', title: `Son kargoya teslim: ${dateTime(o.ship_by)}` };
  if (o.ship_by && o.ship_by - now < 12 * H) return { cls: 'bad', text: 'Gecikme riski', title: `Son kargoya teslim: ${dateTime(o.ship_by)} (${Math.max(0, Math.round((o.ship_by - now) / H))} sa kaldı)` };
  if (now - o.ordered_at > 24 * H) return { cls: 'warn', text: 'Henüz kargoya verilmedi', title: `${Math.floor((now - o.ordered_at) / 864e5) || 1} günü aştı${o.ship_by ? ` · son teslim ${dateTime(o.ship_by)}` : ''}` };
  return null;
}
export const lateBadge = (o) => { const l = lateInfo(o); return l ? html`<span class="late ${l.cls}" title="${l.title}"><b>!</b>${l.text}</span>` : ''; };
// Kanal tarafında (panel dışından) yapılan işlem notu. Kaynak yalnızca satıcı işlemi kesinse belirtilir.
export function extNote(o) {
  let x = o.ext_action;
  try { x = typeof x === 'string' ? JSON.parse(x) : x; } catch { x = null; }
  if (!x || x.status !== o.status) return null;
  const name = ch(o.channel).name;
  return { seller: x.seller, at: x.at, text: x.seller ? `${name} üzerinden işlem yapıldı` : `${name}'da durum güncellendi`, detail: `${x.from || '?'} → ${x.to || '?'}` };
}

export const STATUS_LABEL = { new: 'Yeni', processing: 'Hazırlanıyor', shipped: 'Kargoda', delivered: 'Teslim edildi', cancelled: 'İptal', returned: 'İade' };
export const statusPill = (s) => html`<span class="pill ${s}">${STATUS_LABEL[s] || s}</span>`;

// ---------- kanallar ----------
export const ch = (id) => state.channels.find((c) => c.id === id) || { id, name: id, short: id, type: id };
export const chColor = (id) => `var(--c-${id})`;
// Kanal rozeti (marka renginde harf); grafiklerde ise doğrulanmış kanal renkleri kullanılır
export function chLogo(id, sm = false) {
  const c = ch(id), t = c.type || id, k = sm ? ' sm' : '';
  if (t === 'ikas') return html`<span class="logo-b ikas${k}" title="${c.name}"><i class="ico ico-bolt"></i></span>`;
  if (t === 'trendyol') return html`<span class="logo-b trendyol${k}" title="Trendyol">T</span>`;
  if (t === 'hepsiburada') return html`<span class="logo-b hepsiburada${k}" title="Hepsiburada">hb</span>`;
  if (t === 'pttavm') return html`<span class="logo-b pttavm${k}" title="PttAVM">Ptt</span>`;
  if (t === 'n11') return html`<span class="logo-b${k}" style="background:#7b3fe4;color:#fff" title="N11">n11</span>`;
  if (t === 'idefix') return html`<span class="logo-b${k}" style="background:#ffc20e;color:#1c1c1c" title="idefix">id</span>`;
  if (t === 'pazarama') return html`<span class="logo-b${k}" style="background:#00a2e8;color:#fff" title="Pazarama">pz</span>`;
  return html`<span class="logo-b${k}" style="background:${chColor(id)}">${(c.name || '?').slice(0, 1)}</span>`;
}
export const chBadge = (id) => html`<span class="ch-name">${chLogo(id, true)}<span class="ellipsis">${ch(id).short || ch(id).name}</span></span>`;
export const chState = (c) => (c.gated ? ['off', (c.missing || []).length ? 'Beklemede · bilgi girilmedi' : 'Beklemede · bağlantı testi bekleniyor'] : c.paused ? ['off', 'Pasif'] : !c.enabled ? ['off', 'Bağlı değil'] : c.demo ? ['demo', 'Örnek veri'] : c.last && !c.last.ok ? ['err', 'Hata'] : ['', 'Bağlı']);
export const thumb = (img, name, cls = '') => html`<span class="thumb ${cls}" style="${img ? `background-image:url('${String(img).replace(/['"()\\]/g, '')}')` : ''}">${img ? '' : (name || '?').slice(0, 2)}</span>`;

// ---------- bildirim ----------
export function toast(msg, err = false) {
  const box = $('#toast');
  const el = document.createElement('div');
  el.className = 't-msg' + (err ? ' err' : '');
  el.textContent = msg;
  box.append(el);
  setTimeout(() => el.remove(), err ? 6500 : 3200);
}
// Butonu meşgul gösterip işi çalıştır; hata olursa bildir
export async function busy(btn, fn) {
  const old = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ico ico-sync spin"></i>'; }
  try { return await fn(); } catch (e) { toast(e.message, true); return undefined; } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
}

// ---------- alt pencere ----------
const sheets = [];
export function sheet({ title, body, foot, size = '', onClose } = {}) {
  const bg = document.createElement('div');
  bg.className = 'sheet-bg' + (size.includes('drawer') ? ' drawer-bg' : '');
  bg.innerHTML = `<div class="sheet ${size}" role="dialog" aria-modal="true"><div class="sheet-head"><h2 class="ellipsis"></h2><button class="icon-btn" data-close aria-label="Kapat"><i class="ico ico-x"></i></button></div><div class="sheet-body"></div><div class="sheet-foot hide"></div></div>`;
  const s = { el: bg, body: $('.sheet-body', bg), foot: $('.sheet-foot', bg), title: $('h2', bg) };
  s.title.textContent = title || '';
  s.close = () => { if (!bg.isConnected) return; bg.remove(); sheets.splice(sheets.indexOf(s), 1); document.body.style.overflow = sheets.length ? 'hidden' : ''; onClose && onClose(); };
  s.setBody = (tpl) => render(s.body, tpl);
  s.setFoot = (tpl) => { s.foot.classList.toggle('hide', !tpl); if (tpl) render(s.foot, tpl); };
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) s.close(); });
  if (body) s.setBody(body);
  if (foot) s.setFoot(foot);
  $('#sheet-root').append(bg);
  sheets.push(s);
  document.body.style.overflow = 'hidden';
  return s;
}
if (typeof document !== 'undefined') document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (openMenu) closeMenu(); else if (sheets.length) sheets[sheets.length - 1].close(); } });
export const closeAllSheets = () => [...sheets].forEach((s) => s.close());

export function confirmBox(text, okText = 'Tamam') {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet({
      title: 'Onay', size: 'narrow', body: html`<p style="margin:0">${text}</p>`,
      foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-ok>${okText}</button>`,
      onClose: () => { if (!done) resolve(false); },
    });
    $('[data-ok]', s.el).onclick = () => { done = true; s.close(); resolve(true); };
  });
}

// ---------- açılır menü ----------
let openMenu = null;
const closeMenu = () => { if (openMenu) { openMenu.remove(); openMenu = null; } };
export function popMenu(anchor, items) {
  closeMenu();
  const m = document.createElement('div');
  m.className = 'menu';
  render(m, html`${items.map((it, i) => (it === '-' ? html`<div class="sep"></div>` : html`<button data-i="${i}" ${it.danger ? 'style="color:var(--bad)"' : ''}>${it.icon ? html`<i class="ico ico-${it.icon}"></i>` : ''}${it.label}</button>`))}`);
  document.body.append(m);
  const r = anchor.getBoundingClientRect();
  const left = Math.min(window.innerWidth - m.offsetWidth - 8, Math.max(8, r.right - m.offsetWidth));
  const top = r.bottom + 6 + m.offsetHeight > window.innerHeight ? r.top - m.offsetHeight - 6 : r.bottom + 6;
  m.style.left = left + window.scrollX + 'px';
  m.style.top = top + window.scrollY + 'px';
  m.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { const it = items[Number(b.dataset.i)]; closeMenu(); it.run(); } });
  setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { closeMenu(); document.removeEventListener('click', off); } }), 0);
  openMenu = m;
}

export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const store = {
  get(k, d) { try { const v = localStorage.getItem('panel:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('panel:' + k, JSON.stringify(v)); } catch { /* özel pencere */ } },
};
export const isMobile = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches;
