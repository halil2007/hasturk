// Panel uygulaması: gruplu yan menü, üst çubuk, alt menü (telefon), yönlendirme (#/sayfa/...?filtre=...), giriş, senkron, bildirimler.
import { api, state, html, render, $, $$, toast, ago, closeAllSheets, sheet, popMenu, store, busy } from './core.js';
import { dashboard } from './views/dashboard.js';
import { orders } from './views/orders.js';
import { products } from './views/products.js';
import { stocks } from './views/stocks.js';
import { cargo } from './views/cargo.js';
import { matching } from './views/match.js';
import { buyboxView, bbChannels } from './views/buybox.js';
import { questionsView, qChannels } from './views/questions.js';
import { uploadView } from './views/upload.js';
import { customersView } from './views/customers.js';
import { profitView } from './views/profit.js';
import { insightsView } from './views/insights.js';
import { integrations } from './views/integrations.js';
import { notices } from './views/notices.js';
import { users } from './views/users.js';
import { settingsView } from './views/settings.js';
import { financeView } from './views/finance.js';

const ROUTES = [
  { path: '', title: 'Genel Bakış', icon: 'home', view: dashboard },
  { sec: 'Satış' },
  { path: 'siparisler', title: 'Siparişler', icon: 'orders', view: orders, count: 'orders' },
  { path: 'kargo', title: 'Kargo', icon: 'truck', view: cargo, count: 'cargo' },
  { path: 'sorular', title: 'Müşteri Soruları', icon: 'chat', view: questionsView, count: 'questions', when: () => qChannels().length > 0 },
  { sec: 'Katalog' },
  { path: 'urunler', title: 'Ürünler', icon: 'box', view: products },
  { path: 'stoklar', title: 'Stoklar', icon: 'db', view: stocks, count: 'stock' },
  { path: 'urun-yukle', title: 'Ürün Yükle', icon: 'upload', view: uploadView },
  { path: 'eslestirme', title: 'Eşleştirme', icon: 'link', view: matching, count: 'match' },
  { path: 'buybox', title: 'Buybox', icon: 'bolt', view: buyboxView, when: () => bbChannels().length > 0 },
  { sec: 'Raporlar' },
  { path: 'analiz', title: 'Analizler', icon: 'pie', view: insightsView },
  { path: 'gelir-gider', title: 'Gelir & Gider', icon: 'calc', view: financeView },
  { path: 'kar', title: 'Kârlılık', icon: 'bars', view: profitView },
  { path: 'musteriler', title: 'Müşteriler', icon: 'user', view: customersView },
  { sec: 'Sistem' },
  { path: 'entegrasyonlar', title: 'Entegrasyonlar', icon: 'key', view: integrations, admin: true },
  { path: 'bildirimler', title: 'Bildirimler', icon: 'bell', view: notices, count: 'notices' },
  { path: 'kullanicilar', title: 'Kullanıcılar', icon: 'user', view: users, admin: true },
  { path: 'ayarlar', title: 'Ayarlar', icon: 'gear', view: settingsView },
];
const PAGES = ROUTES.filter((r) => r.view);
const TABS = [['', 'Panel', 'home'], ['siparisler', 'Sipariş', 'orders'], ['kargo', 'Kargo', 'truck'], ['stoklar', 'Stok', 'db']];
const canSee = (r) => (!r.admin || !state.user || state.user.role === 'admin') && (!r.when || r.when());

function nav() {
  const link = (r) => html`<a href="#/${r.path}" data-path="${r.path}"><i class="ico ico-${r.icon}"></i><span>${r.title}</span>${r.count ? html`<span class="count hide" data-count="${r.count}"></span>` : ''}</a>`;
  render($('[data-nav]'), html`${ROUTES.filter((r) => (!r.view || canSee(r)) && !r.hidden).map((r) => (r.sec ? html`<div class="nav-sec">${r.sec}</div>` : link(r)))}`);
  render($('[data-nav-foot]'), '');
  render($('[data-tabbar]'), html`${TABS.map(([p, t, i]) => html`<a href="#/${p}" data-path="${p}"><i class="ico ico-${i}"></i><span>${t}</span>${p === 'siparisler' ? html`<span class="dotn hide" data-count="orders"></span>` : ''}</a>`)}<button data-act="more"><i class="ico ico-menu"></i><span>Menü</span></button>`);
}

export function refreshChrome(s = state.summary) {
  if (!s) return;
  // Destek oturumu (ana panelden müşteri paneline girildi): üstte uyarı ve çıkış
  let sb = $('[data-support-bar]');
  if (s.user && s.user.support && !sb) {
    sb = document.createElement('div'); sb.dataset.supportBar = '1';
    sb.style.cssText = 'position:sticky;top:0;z-index:50;background:var(--amber, #f59e0b);color:#1c1c1c;padding:6px 12px;font-weight:650;font-size:13px;display:flex;gap:10px;align-items:center';
    render(sb, html`<span style="flex:1">Destek oturumu: ${s.tenant ? s.tenant.name : ''} müşteri paneli (2 saat geçerli)</span><button class="btn sm" data-support-exit>Ana panele dön</button>`);
    document.body.prepend(sb);
    sb.querySelector('[data-support-exit]').onclick = async () => { await api('logout', { method: 'POST' }).catch(() => {}); store.set('firma', ''); location.reload(); };
  }
  const n = s.pending.filter((p) => p.status === 'new').reduce((a, p) => a + p.n, 0);
  const counts = { orders: n, questions: s.questions || 0, match: s.unmatched || 0, notices: (s.notices && s.notices.open) || 0, stock: s.stockOut || 0, cargo: s.cargoWaiting || 0 };
  $$('[data-count]').forEach((el) => { const v = counts[el.dataset.count] || 0; el.textContent = v > 99 ? '99+' : v; el.classList.toggle('hide', !v); el.classList.toggle('warn', el.dataset.count === 'match' || el.dataset.count === 'stock'); });
  const chs = state.channels.filter((c) => !c.paused);
  const on = chs.filter((c) => c.enabled), err = chs.filter((c) => c.enabled && !c.demo && c.last && (!c.last.ok || c.last.listingsError));
  const box = $('[data-status]');
  box.classList.toggle('warn', !!err.length || !on.length);
  render(box, html`<span class="led"></span><div><b>${on.length} kanal bağlı</b><span>${err.length ? `${err.length} kanalda hata` : on.some((c) => c.demo) ? 'Örnek veriyle çalışıyor' : on.length ? `Son senkron ${ago(Math.max(...on.map((c) => (c.last && c.last.at) || 0))) || '—'}` : 'Entegrasyonları tamamlayın'}</span></div>`);
  $('[data-bell-dot]').classList.toggle('hide', !((s.notices && s.notices.unread) || n));
  const co = (s.settings && s.settings.company) || {};
  $('[data-company]').textContent = co.legal || co.title || '';
  const logo = (s.settings && s.settings.logo) || 'logo.webp';
  $$('[data-logo]').forEach((i) => { if (i.getAttribute('src') !== logo) i.src = logo; });
  const u = state.user || {};
  $('[data-act=me]').textContent = (u.name || 'Y').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toLocaleUpperCase('tr');
  $('[data-act=me]').title = `${u.name || ''} (${u.role === 'admin' ? 'Yönetici' : 'Personel'})`;
}

// Adres: #/sayfa/alt/... ?anahtar=değer  (filtreler adreste tutulur; geri tuşu çalışır)
export function parseHash() {
  const [p, qs = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [path = '', ...rest] = p.split('/');
  return { path, rest: rest.map(decodeURIComponent), query: Object.fromEntries(new URLSearchParams(qs)) };
}
export function setQuery(query) {
  const { path, rest } = parseHash();
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null && v !== 'all')).toString();
  history.replaceState(null, '', `#/${[path, ...rest.map(encodeURIComponent)].filter((x, i) => i === 0 || x).join('/')}${qs ? '?' + qs : ''}`);
}

let current = null, currentPath = null, routeSeq = 0;
// Sayfa iskeleti: veri gelene kadar sayfa boş kalmaz (görünüm ilk çizimde bunu değiştirir)
const SKELETON = html`<div class="skel-page" aria-busy="true" aria-label="Yükleniyor"><div class="skel-row"><span class="skel w40"></span><span class="skel w20"></span></div><div class="skel-card"><span class="skel w30"></span><span class="skel"></span><span class="skel w80"></span><span class="skel w60"></span></div><div class="skel-card"><span class="skel"></span><span class="skel w70"></span><span class="skel w90"></span><span class="skel w50"></span><span class="skel w80"></span></div></div>`;
async function route() {
  const my = ++routeSeq;
  const { path, rest, query } = parseHash();
  const r = PAGES.find((x) => x.path === path && canSee(x)) || PAGES[0];
  $$('[data-path]').forEach((a) => a.classList.toggle('on', a.dataset.path === r.path));
  $('[data-title]').textContent = r.title;
  $('[data-sub]').textContent = state.demo ? 'Örnek veriler' : (state.settings && state.settings.company && state.settings.company.title) || '';
  document.title = `${r.title} · ${(state.settings && state.settings.company && state.settings.company.title) || 'Hastürk'} CRM`;
  if (current && current.destroy) current.destroy();
  // Her sayfa temiz bir kapsayıcıyla başlar (önceki sayfanın olay dinleyicileri taşınmaz)
  const old = $('#view'), el = old.cloneNode(false);
  render(el, SKELETON);
  old.replaceWith(el);
  if (currentPath !== r.path) window.scrollTo(0, 0);
  currentPath = r.path;
  current = null;
  try {
    const v = (await r.view(el, rest, query)) || null;
    // Bu arada başka sayfaya geçildiyse geç kalan sayfa sonucu kullanılmaz
    if (my !== routeSeq) { if (v && v.destroy) v.destroy(); return; }
    current = v;
  } catch (e) {
    if (my !== routeSeq) return;
    render(el, html`<div class="card"><div class="notice bad"><i class="ico ico-warn"></i><div style="flex:1">Sayfa yüklenemedi: ${e.message}</div><button class="btn sm" data-retry>Tekrar dene</button></div></div>`);
    const b = el.querySelector('[data-retry]'); if (b) b.onclick = () => route();
  }
}

export async function loadSummary() {
  const s = await api('summary', { fresh: true });
  state.channels = s.channels; state.settings = s.settings; state.summary = s; state.user = s.user; state.tenant = s.tenant || null; state.owner = !!s.owner; state.demo = s.demo || s.channels.some((c) => c.demo);
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
      const errs = [...Object.values(r.channels || {}), ...Object.values(r.listings || {})].filter((v) => typeof v === 'string');
      const count = Object.values(r.channels || {}).filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0);
      toast(errs.length ? `${errs.length} adımda hata var (Bildirimler)` : `Senkron tamam: ${count} sipariş kontrol edildi${r.match && (r.match.linked || r.match.created) ? `, ${r.match.linked + r.match.created} ürün eşleşti` : ''}`, !!errs.length);
    }
    await loadSummary();
    if (current && current.refresh) current.refresh();
  } catch (e) { toast(e.message, true); } finally { icons.forEach((i) => i.classList.remove('spin')); }
}

async function bell(btn) {
  const s = state.summary;
  if (!s) return;
  const list = await api('notices').catch(() => []);
  const n = s.pending.filter((p) => p.status === 'new').reduce((a, p) => a + p.n, 0);
  const items = [];
  if (n) items.push({ icon: 'orders', label: `${n} yeni sipariş işleme alınmayı bekliyor`, run: () => (location.hash = '#/siparisler?status=new') });
  for (const x of list.slice(0, 5)) items.push({ icon: x.level === 'error' ? 'warn' : 'bell', label: x.title, run: () => (location.hash = '#/bildirimler') });
  if (s.questions) items.push({ icon: 'chat', label: `${s.questions} müşteri sorusu cevap bekliyor`, run: () => (location.hash = '#/sorular') });
  if (s.unmatched) items.push({ icon: 'link', label: `${s.unmatched} ilan eşleşme bekliyor`, run: () => (location.hash = '#/eslestirme') });
  if (!items.length) items.push({ icon: 'check', label: 'Bekleyen bildirim yok', run: () => {} });
  items.push('-', { icon: 'bell', label: 'Tüm bildirimler', run: () => (location.hash = '#/bildirimler') });
  popMenu(btn, items);
  if (list.some((x) => !x.read)) api('notices/read', { method: 'POST' }).then(loadSummary).catch(() => {});
}

function meMenu(btn) {
  const theme = store.get('theme', 'auto');
  const setTheme = (t) => { store.set('theme', t); applyTheme(); };
  const u = state.user || {};
  popMenu(btn, [
    { icon: 'user', label: `${u.name || ''} · ${u.role === 'admin' ? 'Yönetici' : 'Personel'}${state.tenant ? ` · ${state.tenant.name}` : ''}`, run: () => {} },
    ...(u.id > 0 ? [{ icon: 'key', label: 'Şifremi değiştir', run: changePassword }] : []),
    { icon: 'sync', label: 'Şimdi senkronla', run: sync },
    '-',
    { label: `${theme === 'light' ? '✓ ' : ''}Açık tema`, run: () => setTheme('light') },
    { label: `${theme === 'dark' ? '✓ ' : ''}Koyu tema`, run: () => setTheme('dark') },
    { label: `${theme === 'auto' ? '✓ ' : ''}Cihaz temasına uy`, run: () => setTheme('auto') },
    '-',
    { icon: 'x', label: 'Çıkış yap', danger: true, run: async () => { await api('logout', { method: 'POST' }).catch(() => {}); location.reload(); } },
  ]);
}
function changePassword() {
  const s = sheet({
    title: 'Şifremi değiştir', size: 'narrow',
    body: html`<div class="stack"><label class="field"><span>Mevcut şifre</span><input class="input" type="password" data-old autocomplete="current-password"></label>
      <label class="field"><span>Yeni şifre (en az 8 karakter)</span><input class="input" type="password" data-new autocomplete="new-password"></label></div>`,
    foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-save>Kaydet</button>`,
  });
  $('[data-save]', s.el).onclick = (e) => busy(e.currentTarget, async () => { await api('me/password', { method: 'POST', body: { old: $('[data-old]', s.el).value, new: $('[data-new]', s.el).value } }); toast('Şifre değişti, tekrar giriş yapın'); setTimeout(() => location.reload(), 1200); });
}
function applyTheme() {
  const t = store.get('theme', 'auto');
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
}

function moreMenu() {
  const s = sheet({
    title: 'Menü', size: 'narrow',
    body: html`${ROUTES.filter((r) => (!r.view || canSee(r)) && !r.hidden).map((r) => (r.sec ? html`<div class="muted tiny" style="font-weight:700;text-transform:uppercase;margin:14px 2px 6px">${r.sec}</div>` : html`<a class="btn block" style="justify-content:flex-start;margin-bottom:6px" href="#/${r.path}"><i class="ico ico-${r.icon}"></i>${r.title}</a>`))}`,
  });
  s.body.addEventListener('click', (e) => { if (e.target.closest('a')) s.close(); });
}

async function login(info = {}) {
  closeAllSheets();
  $$('.side, .main, .tabbar').forEach((e) => e.classList.add('hide'));
  if ($('.login')) return;
  const brand = await fetch('/api/brand').then((r) => r.json()).catch(() => ({}));
  // Müşteri paneli: firma kodu adresle (?firma=kod) gelebilir; son kullanılan hatırlanır
  const firma = new URLSearchParams(location.search).get('firma') || store.get('firma', '');
  const box = document.createElement('div');
  box.className = 'login';
  render(box, html`<form class="card stack">
    <img class="logo-big" src="${brand.logo || 'logo.webp'}" alt="${brand.title || 'Logo'}">
    <div class="muted small" style="text-align:center;margin-top:-6px">${brand.legal || brand.title || ''} · Satış yönetim paneli</div>
    ${info.setup ? html`<div class="notice warn"><i class="ico ico-warn"></i><div>Panel şifresi henüz tanımlanmamış. Cloudflare → Worker → Settings → Variables and Secrets bölümüne <b>PANEL_PASSWORD</b> ekleyin.</div></div>` : ''}
    ${info.demo || brand.demo ? html`<div class="notice"><div>Deneme modu: kullanıcı adı boş, şifre <b>demo</b></div></div>` : ''}
    <label class="field"><span>Firma kodu <span class="muted tiny">(müşteri paneli)</span></span><input class="input" name="tenant" autocomplete="organization" placeholder="ana panel için boş bırakın" value="${firma}"></label>
    <label class="field"><span>Kullanıcı adı</span><input class="input" name="username" autocomplete="username" placeholder="ana yönetici için boş bırakın"></label>
    <label class="field"><span>Şifre</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
    <button class="btn primary block lg" type="submit">Giriş yap</button>
    <div class="small" style="color:var(--bad)" data-err></div>
  </form>`);
  document.body.prepend(box);
  $(firma ? '[name=username]' : '[name=tenant]', box).focus();
  $('form', box).onsubmit = async (e) => {
    e.preventDefault();
    try {
      const tenant = e.target.tenant.value.trim().toLocaleLowerCase('tr');
      await api('login', { method: 'POST', body: { tenant, username: e.target.username.value.trim(), password: e.target.password.value } });
      store.set('firma', tenant);
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
  const q = e.target.value.trim();
  e.target.value = '';
  location.hash = '#/siparisler?q=' + encodeURIComponent(q);
});
setInterval(() => { loadSummary().catch(() => {}); }, 3 * 60e3);
start();
export { ago };
