// Panel uygulaması: menü, sayfa yönlendirme (#/...), giriş, senkron düğmesi.
import { api, state, html, render, $, $$, toast, ago, closeAllSheets } from './core.js';
import { dashboard } from './views/dashboard.js';
import { orders, openOrder } from './views/orders.js';
import { products } from './views/products.js';
import { statsView } from './views/stats.js';
import { profitView } from './views/profit.js';
import { settingsView } from './views/settings.js';

const ROUTES = [
  { path: '', title: 'Özet', icon: 'home', view: dashboard },
  { path: 'siparisler', title: 'Siparişler', icon: 'orders', view: orders },
  { path: 'urunler', title: 'Ürünler & Stok', short: 'Ürünler', icon: 'tag', view: products },
  { path: 'istatistik', title: 'İstatistik', icon: 'chart', view: statsView },
  { path: 'kar', title: 'Kârlılık', short: 'Kâr', icon: 'calc', view: profitView },
  { path: 'ayarlar', title: 'Ayarlar', icon: 'gear', view: settingsView, hidden: true },
];

function nav() {
  const link = (r) => html`<a href="#/${r.path}" data-path="${r.path}"><i class="ico ico-${r.icon}"></i><span>${r.short && window.innerWidth < 960 ? r.short : r.title}</span>${r.path === 'siparisler' ? html`<span class="count hide" data-pending></span>` : ''}</a>`;
  render($('.nav'), html`${ROUTES.map(link)}`);
  render($('.tabbar'), html`${ROUTES.filter((r) => !r.hidden).map((r) => html`<a href="#/${r.path}" data-path="${r.path}"><i class="ico ico-${r.icon}"></i><span>${r.short || r.title}</span>${r.path === 'siparisler' ? html`<span class="badge-dot hide" data-pending></span>` : ''}</a>`)}`);
}

export function setPending(nPending) {
  $$('[data-pending]').forEach((el) => { el.textContent = nPending > 99 ? '99+' : nPending; el.classList.toggle('hide', !nPending); });
}

let current = null;
async function route() {
  const [, path = '', ...rest] = location.hash.replace(/^#/, '').split('/');
  const r = ROUTES.find((x) => x.path === path) || ROUTES[0];
  $$('.nav a, .tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.path === r.path));
  $('.top-title').textContent = r.title;
  document.title = `${r.title} · Satış Paneli`;
  if (current && current.destroy) current.destroy();
  const el = $('#view');
  el.innerHTML = '';
  current = (await r.view(el, rest.map(decodeURIComponent))) || null;
  // Sipariş adresi doğrudan açıldıysa (#/siparisler/ID) detayı göster
  if (r.path === 'siparisler' && rest[0] && rest[0] !== 'kanal') openOrder(decodeURIComponent(rest[0]), () => current && current.refresh && current.refresh());
}

async function sync(btn) {
  const icons = $$('[data-act=sync] .ico');
  icons.forEach((i) => i.classList.add('spin'));
  try {
    const r = await api('sync', { method: 'POST', body: { force: true } });
    if (r.skipped) toast(r.skipped);
    else {
      const errs = Object.entries(r.channels || {}).filter(([, v]) => typeof v === 'string');
      const count = Object.values(r.channels || {}).filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0);
      toast(errs.length ? `${errs.length} kanalda hata var (Ayarlar → Kayıtlar)` : `Senkron tamam: ${count} sipariş kontrol edildi`, !!errs.length);
    }
    state.lastSync = Date.now();
    updateSyncState();
    if (current && current.refresh) current.refresh();
  } catch (e) { toast(e.message, true); } finally { icons.forEach((i) => i.classList.remove('spin')); }
}
function updateSyncState() {
  const last = Math.max(0, ...state.channels.map((c) => (c.last && c.last.at) || 0), state.lastSync || 0);
  $('.sync-state').textContent = last ? `Son senkron: ${ago(last)}` : 'Henüz senkron yapılmadı';
}

function login(info = {}) {
  closeAllSheets();
  $('#app').classList.add('hide');
  const box = document.createElement('div');
  box.className = 'login';
  render(box, html`<form class="card stack">
    <div class="row"><span class="logo" style="width:36px;height:36px;border-radius:10px;background:url(icon.svg) center/cover"></span><h2>Satış Paneli</h2></div>
    ${info.setup ? html`<div class="notice warn"><i class="ico ico-warn"></i><div>Panel şifresi henüz tanımlanmamış. Cloudflare → Worker → Settings → Variables and Secrets bölümüne <b>PANEL_PASSWORD</b> ekleyin.</div></div>` : ''}
    ${info.demo ? html`<div class="notice"><div>Deneme modu: şifre <b>demo</b></div></div>` : ''}
    <label class="field"><span>Şifre</span><input class="input" type="password" name="password" autocomplete="current-password" required autofocus></label>
    <button class="btn primary block" type="submit">Giriş yap</button>
    <div class="muted small" data-err></div>
  </form>`);
  document.body.prepend(box);
  $('form', box).onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('login', { method: 'POST', body: { password: e.target.password.value } });
      box.remove();
      $('#app').classList.remove('hide');
      start();
    } catch (err) { $('[data-err]', box).textContent = err.message; }
  };
}
state.onLogin = (info) => { if (!$('.login')) login(info); };

async function start() {
  try {
    const s = await api('summary');
    state.channels = s.channels;
    state.settings = s.settings;
    state.summary = s;
    setPending(s.pending.filter((p) => p.status === 'new').reduce((a, p) => a + p.n, 0));
    updateSyncState();
  } catch { return; }
  nav();
  route();
}

window.addEventListener('hashchange', route);
document.addEventListener('click', (e) => { const b = e.target.closest('[data-act=sync]'); if (b && !b.closest('#view')) { e.preventDefault(); sync(b); } });
setInterval(updateSyncState, 60e3);
start();
