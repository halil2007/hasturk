// Ortak arayüz yardımcıları: API, güvenli HTML şablonu, biçimlendirme, bildirim, alt pencere.

export const state = { channels: [], settings: null, me: null, onLogin: null };

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
export const render = (el, tpl) => { el.innerHTML = tpl.s ?? tpl; return el; };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// data-act="..." tıklamalarını tek yerden yakala
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
export const pct = (v) => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${nf.format(v)}%`);
export const delta = (cur, prev) => (prev ? ((cur - prev) / Math.abs(prev)) * 100 : cur ? null : 0);
const dtf = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
const df = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' });
export const dateTime = (ms) => (ms ? dtf.format(new Date(ms)) : '');
export const date = (ms) => (ms ? df.format(new Date(ms)) : '');
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

export const STATUS_LABEL = { new: 'Yeni', processing: 'Hazırlanıyor', shipped: 'Kargoda', delivered: 'Teslim edildi', cancelled: 'İptal', returned: 'İade' };
export const statusPill = (s) => html`<span class="pill ${s}">${STATUS_LABEL[s] || s}</span>`;

// ---------- kanallar ----------
export const ch = (id) => state.channels.find((c) => c.id === id) || { id, name: id, short: id };
export const chColor = (id) => `var(--c-${id})`;
export const chBadge = (id) => html`<span class="ch-badge"><span class="dot" style="background:${chColor(id)}"></span>${ch(id).name}</span>`;

// ---------- bildirim ----------
export function toast(msg, err = false) {
  const box = $('#toast');
  const el = document.createElement('div');
  el.className = 't-msg' + (err ? ' err' : '');
  el.textContent = msg;
  box.append(el);
  setTimeout(() => el.remove(), err ? 6000 : 3200);
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
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet ${size}" role="dialog" aria-modal="true"><div class="sheet-head"><h2 class="ellipsis"></h2><button class="icon-btn" data-close aria-label="Kapat"><i class="ico ico-x"></i></button></div><div class="sheet-body"></div><div class="sheet-foot hide"></div></div>`;
  const s = { el: bg, body: $('.sheet-body', bg), foot: $('.sheet-foot', bg), title: $('h2', bg) };
  s.title.textContent = title || '';
  s.close = () => { bg.remove(); sheets.splice(sheets.indexOf(s), 1); document.body.style.overflow = sheets.length ? 'hidden' : ''; onClose && onClose(); };
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
if (typeof document !== 'undefined') document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheets.length) sheets[sheets.length - 1].close(); });
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

// Basit gecikmeli çağırma (arama kutuları için)
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const store = {
  get(k, d) { try { const v = localStorage.getItem('panel:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('panel:' + k, JSON.stringify(v)); } catch { /* özel pencere */ } },
};
