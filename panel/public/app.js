// Panel uygulaması: yan menü, üst çubuk, alt menü (telefon), sayfa yönlendirme (#/...), giriş, senkron, bildirimler.
import { api, state, html, render, $, $$, toast, ago, closeAllSheets, sheet, popMenu, store, chState } from './core.js';
import { dashboard } from './views/dashboard.js';
import { orders } from './views/orders.js';
import { products } from './views/products.js';
import { stocks } from './views/stocks.js';
import { cargo } from './views/cargo.js';
import { profitView } from './views/profit.js';
import { statsView } from './views/stats.js';
import { integrations } from './views/integrations.js';
import { settingsView } from './views/settings.js';

const ROUTES = [
  { path: '', title: 'Genel Bakış', icon: 'home', view: dashboard },
  { path: 'siparisler', title: 'Siparişler', icon: 'orders', view: orders, count: true },
  { path: 'urunler', title: 'Ürünler', icon: 'box', view: products },
  { path: 'stoklar', title: 'Stoklar', icon: 'db', view: stocks },
  { path: 'kargo', title: 'Kargo', icon: 'truck', view: cargo },
  { path: 'kar', title: 'Kârlılık', icon: 'bars', view: profitView },
  { path: 'analiz', title: 'Analizler', icon: 'pie', view: statsView },
  { path: 'entegrasyonlar', title: 'Entegrasyonlar', icon: 'link', view: integrations },
  { path: 'ayarlar', title: 'Ayarlar', icon: 'gear', view: settingsView, foot: true },
];
const TABS = [['', 'Panel', 'home'], ['siparisler', 'Sipariş', 'orders'], ['stoklar', 'Stok', 'db'], ['kar', 'Kâr', 'bars']];

function nav() {
  const link = (r) => html`<a href="#/${r.path}" data-path="${r.path}"><i class="ico ico-${r.icon}"></i><span>${r.title}</span>${r.count ? html`<span class="count hide" data-pending></span>` : ''}</a>`;
  render($('[data-nav]'), html`${ROUTES.filter((r) => !r.foot).map(link)}`);
  render($('[data-nav-foot]'), html`${ROUTES.filter((r) => r.foot).map(link)}`);
  render($('[data-tabbar]'), html`${TABS.map(([p, t, i]) => html`<a href="#/${p}" data-path="${p}"><i class="ico ico-${i}"></i><span>${t}</span>${p === 'siparisler' ? html`<span class="dotn hide" data-pending></span>` : ''}</a>`)}<button data-act="more"><i class="ico ico-menu"></i><span>Menü</span></button>`);
}

export function refreshChrome(s = state.summary) {
  if (!s) return;
  const n = s.pending.filter((p) => p.status === 'new').reduce((a, p) => a + p.n, 0);
  $$('[data-pending]').forEach((el) => { el.textContent = n > 99 ? '99+' : n; el.classList.toggle('hide', !n); });
  const chs = state.channels;
  const on = chs.filter((c) => c.enabled), err = chs.filter((c) => c.enabled && !c.demo && c.last && !c.last.ok);
  const box = $('[data-status]');
  box.classList.toggle('warn', !!err.length || !on.length);
  render(box, html`<span class="led"></span><div><b>${on.length} kanal bağlı</b><span>${err.length ? `${err.length} kanalda hata` : on.some((c) => c.demo) ? 'Örnek veriyle çalışıyor' : on.length ? 'Tüm sistemler aktif' : 'Entegrasyonları tamamlayın'}</span></div>`);
  $('[data-bell-dot]').classList.toggle('hide', !(n || s.lowStock.length || err.length));
}

let current = null;
async function route() {
  const [, path = '', ...rest] = location.hash.replace(/^#/, '').split('/');
  const r = ROUTES.find((x) => x.path === path) || ROUTES[0];
  $$('[data-path]').forEach((a) => a.classList.toggle('on', a.dataset.path === r.path));
  $('[data-title]').textContent = r.title;
  $('[data-sub]').textContent = state.demo ? 'Örnek veriler' : '';
  document.title = `${r.title} · Satış Yönetimi`;
  if (current && current.destroy) current.destroy();
  // Her sayfa temiz bir kapsayıcıyla başlar (önceki sayfanın olay dinleyicileri taşınmaz)
  const old = $('#view'), el = old.cloneNode(false);
  old.replaceWith(el);
  window.scrollTo(0, 0);
  current = (await r.view(el, rest.map(decodeURIComponent))) || null;
}

async function loadSummary() {
  const s = await api('summary');
  state.channels = s.channels; state.settings = s.settings; state.summary = s; state.demo = s.channels.some((c) => c.demo);
  refreshChrome(s);
  return s;
}

async function sync() {
  const icons = $$('[data-act=sync] .ico');
  icons.forEach((i) => i.classList.add('spin'));
  try {
    const r = await api('sync', { method: 'POST', body: { force: true } });
    if (r.skipped) toast(r.skipped);
    else {
      const errs = Object.entries(r.channels || {}).filter(([, v]) => typeof v === 'string');
      const count = Object.values(r.channels || {}).filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0);
      toast(errs.length ? `${errs.length} kanalda hata var (Entegrasyonlar sayfasına bakın)` : `Senkron tamam: ${count} sipariş kontrol edildi`, !!errs.length);
    }
    await loadSummary();
    if (current && current.refresh) current.refresh();
  } catch (e) { toast(e.message, true); } finally { icons.forEach((i) => i.classList.remove('spin')); }
}

function bell(btn) {
  const s = state.summary;
  if (!s) return;
  const n = s.pending.filter((p) => p.status === 'new').reduce((a, p) => a + p.n, 0);
  const errs = state.channels.filter((c) => c.enabled && !c.demo && c.last && !c.last.ok);
  const items = [];
  if (n) items.push({ icon: 'orders', label: `${n} yeni sipariş işleme alınmayı bekliyor`, run: () => (location.hash = '#/siparisler/durum/new') });
  if (s.lowStock.length) items.push({ icon: 'warn', label: `${s.lowStock.length} ürün kritik stokta`, run: () => (location.hash = '#/stoklar/kritik') });
  if (s.unlinked) items.push({ icon: 'link', label: `${s.unlinked} ilan ürünle eşleşmemiş`, run: () => (location.hash = '#/urunler/eslestir') });
  for (const c of errs) items.push({ icon: 'warn', label: `${c.name}: senkron hatası`, run: () => (location.hash = '#/entegrasyonlar') });
  if (!items.length) items.push({ icon: 'check', label: 'Bekleyen bildirim yok', run: () => {} });
  popMenu(btn, items);
}

function meMenu(btn) {
  const theme = store.get('theme', 'auto');
  const setTheme = (t) => { store.set('theme', t); applyTheme(); };
  popMenu(btn, [
    { icon: 'sync', label: 'Şimdi senkronla', run: sync },
    { icon: 'link', label: 'Entegrasyonlar', run: () => (location.hash = '#/entegrasyonlar') },
    '-',
    { label: `${theme === 'light' ? '✓ ' : ''}Açık tema`, run: () => setTheme('light') },
    { label: `${theme === 'dark' ? '✓ ' : ''}Koyu tema`, run: () => setTheme('dark') },
    { label: `${theme === 'auto' ? '✓ ' : ''}Cihaz temasına uy`, run: () => setTheme('auto') },
    '-',
    { icon: 'x', label: 'Çıkış yap', danger: true, run: async () => { await api('logout', { method: 'POST' }).catch(() => {}); location.reload(); } },
  ]);
}
function applyTheme() {
  const t = store.get('theme', 'auto');
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
}

function moreMenu() {
  const s = sheet({
    title: 'Menü', size: 'narrow',
    body: html`<div class="list">${ROUTES.map((r) => html`<a class="btn block" style="justify-content:flex-start" href="#/${r.path}" data-close><i class="ico ico-${r.icon}"></i>${r.title}</a>`)}</div>`,
  });
  s.body.addEventListener('click', (e) => { if (e.target.closest('a')) s.close(); });
}

function login(info = {}) {
  closeAllSheets();
  $$('.side, .main, .tabbar').forEach((e) => e.classList.add('hide'));
  if ($('.login')) return;
  const box = document.createElement('div');
  box.className = 'login';
  render(box, html`<form class="card stack">
    <div class="row"><img src="icon.svg" alt="" style="width:40px;height:40px"><div><h2>Satış Yönetimi</h2><div class="muted small">5 kanal, tek panel</div></div></div>
    ${info.setup ? html`<div class="notice warn"><i class="ico ico-warn"></i><div>Panel şifresi henüz tanımlanmamış. Cloudflare → Worker → Settings → Variables and Secrets bölümüne <b>PANEL_PASSWORD</b> ekleyin.</div></div>` : ''}
    ${info.demo ? html`<div class="notice"><div>Deneme modu: şifre <b>demo</b></div></div>` : ''}
    <label class="field"><span>Şifre</span><input class="input" type="password" name="password" autocomplete="current-password" required autofocus></label>
    <button class="btn primary block lg" type="submit">Giriş yap</button>
    <div class="small" style="color:var(--bad)" data-err></div>
  </form>`);
  document.body.prepend(box);
  $('form', box).onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('login', { method: 'POST', body: { password: e.target.password.value } });
      box.remove();
      $$('.side, .main, .tabbar').forEach((x) => x.classList.remove('hide'));
      start();
    } catch (err) { $('[data-err]', box).textContent = err.message; }
  };
}
state.onLogin = (info) => login(info);

async function start() {
  try { await loadSummary(); } catch { return; }
  nav();
  refreshChrome();
  route();
}

applyTheme();
window.addEventListener('hashchange', route);
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.closest('#view') || b.closest('.sheet-bg')) return;
  const a = b.dataset.act;
  if (a === 'sync') { e.preventDefault(); sync(); }
  if (a === 'bell') { e.preventDefault(); bell(b); }
  if (a === 'me') { e.preventDefault(); meMenu(b); }
  if (a === 'more') { e.preventDefault(); moreMenu(); }
});
$('[data-global-search]').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  state.globalQ = e.target.value.trim();
  e.target.value = '';
  if (location.hash.startsWith('#/siparisler')) route(); else location.hash = '#/siparisler';
});
setInterval(() => { loadSummary().catch(() => {}); }, 5 * 60e3);
start();
export { loadSummary, ago };
