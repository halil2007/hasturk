// Panel uygulaması: gruplu yan menü, üst çubuk, alt menü (telefon), yönlendirme (#/sayfa/...?filtre=...), giriş, senkron, bildirimler.
import { api, state, html, render, $, $$, toast, ch, ago, closeAllSheets, sheet, popMenu, store, busy, swrScope, prefetch, recorder, themeOf, applyTheme } from './core.js';
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
import { supportView, refreshCount, openTicketForm } from './views/support.js';
import { openHelp } from './help.js';
import { users } from './views/users.js';
import { firmsView } from './views/firms.js';
import { channelProductsView } from './views/chproducts.js';
import { settingsView } from './views/settings.js';
import { financeView } from './views/finance.js';
import { hbTestView } from './views/hbtest.js';
import { claimsView, claimChannels } from './views/claims.js';
import { campaignsView, campaignChannels } from './views/campaigns.js';
import { codeStep, mailStep, forcedSetup, twofaSettings } from './twofa.js';
import { can, viewOnly } from './perms.js';
import { billingView } from './views/billing.js';
import { blogView } from './views/blog.js';
// Panelde gösterilen ürün adı (firma unvanı yerine)
const BRAND = 'Hastürk CRM Sistemleri';

const ROUTES = [
  { path: '', title: 'Genel Bakış', icon: 'home', view: dashboard },
  { sec: 'Satış' },
  { path: 'siparisler', title: 'Siparişler', icon: 'orders', view: orders, count: 'orders', perm: 'orders' },
  { path: 'kargo', title: 'Kargo', icon: 'truck', view: cargo, count: 'cargo', perm: 'cargo' },
  { path: 'iadeler', title: 'İadeler', icon: 'return', view: claimsView, count: 'claims', perm: 'returns' },
  { path: 'sorular', title: 'Müşteri Soruları', icon: 'chat', view: questionsView, count: 'questions', perm: 'questions' },
  { sec: 'Ürünler' },
  // Gruplu sayfalar: menüde grup tek satır; grubun sayfaları sayfanın üstünde sekme olarak (tab: sekme adı)
  { path: 'urunler', title: 'Ürünler', tab: 'Ürün listesi', icon: 'box', view: products, perm: 'products', group: 'katalog' },
  { path: 'stoklar', title: 'Stoklar', tab: 'Stoklar', icon: 'db', view: stocks, count: 'stock', perm: 'stock', group: 'katalog' },
  { path: 'kanal-urunleri', title: 'Kanal Ürünleri', tab: 'Kanaldaki ürünler', icon: 'grid', view: channelProductsView, perm: 'products', group: 'katalog' },
  { path: 'eslestirme', title: 'Eşleştirme', tab: 'Eşleştirme', icon: 'link', view: matching, count: 'match', perm: 'match', group: 'katalog' },
  { path: 'urun-yukle', title: 'Pazaryerine Yükle', tab: 'Pazaryerine yükle', icon: 'upload', view: uploadView, perm: 'products', group: 'katalog' },
  { path: 'kampanyalar', title: 'Kampanyalar', tab: 'Kampanyalar', icon: 'tag', view: campaignsView, perm: 'products', group: 'fiyat' },
  { path: 'buybox', title: 'Buybox', tab: 'Buybox (fiyat rekabeti)', icon: 'bolt', view: buyboxView, perm: 'products', group: 'fiyat' },
  { sec: 'Raporlar' },
  { path: 'analiz', title: 'Analizler', tab: 'Satış analizi', icon: 'pie', view: insightsView, perm: 'reports', group: 'rapor' },
  { path: 'gelir-gider', title: 'Gelir & Gider', tab: 'Gelir & gider', icon: 'calc', view: financeView, perm: 'finance', group: 'rapor' },
  { path: 'kar', title: 'Kârlılık', tab: 'Kâr hesapla', icon: 'bars', view: profitView, perm: 'finance', group: 'rapor' },
  { path: 'musteriler', title: 'Müşteriler', tab: 'Müşteriler', icon: 'user', view: customersView, perm: 'reports', group: 'rapor' },
  { sec: 'Sistem' },
  { path: 'entegrasyonlar', title: 'Entegrasyonlar', icon: 'key', view: integrations, admin: true },
  { path: 'kullanicilar', title: 'Personel', icon: 'team', view: users, admin: true },
  { path: 'firmalar', title: 'Firmalar', icon: 'grid', view: firmsView, admin: true, when: () => !!state.owner },
  { path: 'blog', title: 'Blog', icon: 'doc', view: blogView, admin: true, when: () => !!state.owner },
  { path: 'paketim', title: 'Paketim', icon: 'tag', view: billingView, admin: true, when: () => !!state.tenant && !state.demo },
  { path: 'ayarlar', title: 'Ayarlar', icon: 'gear', view: settingsView },
  { path: 'destek', title: 'Destek', icon: 'help', view: supportView, count: 'support' },
  { path: 'bildirimler', title: 'Bildirimler', icon: 'bell', view: notices, count: 'notices', hidden: true },
  { path: 'hb-test', title: 'Hepsiburada test adımları', icon: 'check', view: hbTestView, admin: true, hidden: true, when: () => !state.tenant },
];
const PAGES = ROUTES.filter((r) => r.view);
// Menü grupları: menüde tek satır (ilk görülebilen sayfaya gider), rozet = grubun sayfalarının rozet toplamı
const GROUPS = { katalog: { title: 'Ürünler', icon: 'box' }, fiyat: { title: 'Fiyat & Kampanya', icon: 'tag' }, rapor: { title: 'Raporlar', icon: 'pie' } };
const groupPages = (g) => PAGES.filter((r) => r.group === g && canSee(r) && !r.hidden);
const TABS = [['', 'Panel', 'home'], ['siparisler', 'Sipariş', 'orders'], ['kargo', 'Kargo', 'truck'], ['stoklar', 'Stok', 'db']];
const canSee = (r) => (!r.admin || !state.user || state.user.role === 'admin') && can(state.user, r.perm) && (!r.when || r.when());

function nav() {
  const link = (r) => html`<a href="#/${r.path}" data-path="${r.path}" title="${r.title}"><i class="ico ico-${r.icon}"></i><span>${r.title}</span>${r.count ? html`<span class="count hide" data-count="${r.count}"></span>` : ''}</a>`;
  const glink = (g) => { const ps = groupPages(g), G = GROUPS[g], cnt = ps.map((x) => x.count).filter(Boolean).join('+');
    return ps.length ? html`<a href="#/${ps[0].path}" data-group="${g}" title="${G.title}: ${ps.map((x) => x.tab).join(', ')}"><i class="ico ico-${G.icon}"></i><span>${G.title}</span>${cnt ? html`<span class="count hide" data-count="${cnt}"></span>` : ''}</a>` : ''; };
  const seen = new Set(), items = [];
  for (const r of ROUTES) {
    if (r.sec) { items.push(html`<div class="nav-sec">${r.sec}</div>`); continue; }
    if (!canSee(r) || r.hidden) continue;
    if (r.group) { if (!seen.has(r.group)) { seen.add(r.group); items.push(glink(r.group)); } continue; }
    items.push(link(r));
  }
  render($('[data-nav]'), html`${items}`);
  render($('[data-nav-foot]'), '');
  render($('[data-tabbar]'), html`${TABS.filter(([p]) => { const r = PAGES.find((x) => x.path === p); return !r || canSee(r); }).map(([p, t, i]) => html`<a href="#/${p}" data-path="${p}"><i class="ico ico-${i}"></i><span>${t}</span>${p === 'siparisler' ? html`<span class="dotn hide" data-count="orders"></span>` : ''}</a>`)}<button data-act="more"><i class="ico ico-menu"></i><span>Menü</span></button>`);
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
  // Abonelik / deneme bitişine 7 gün ve daha az kaldı: üstte uyarı (yalnız müşteri panelinde; demo hariç)
  const tn = s.tenant, left = tn && tn.days_left;
  let eb = $('[data-expiry-bar]');
  if (tn && !s.demo && left != null && left <= 7 && !(s.user && s.user.support)) {
    if (!eb) { eb = document.createElement('div'); eb.dataset.expiryBar = '1'; document.body.prepend(eb); }
    const urgent = left <= 2;
    eb.style.cssText = `position:sticky;top:0;z-index:50;background:${urgent ? '#fee2e2' : '#fef3c7'};color:${urgent ? '#7f1d1d' : '#713f12'};padding:7px 14px;font-weight:600;font-size:13px;display:flex;gap:10px;align-items:center;flex-wrap:wrap`;
    const when = left <= 0 ? 'bugün sona eriyor' : left === 1 ? 'yarın sona eriyor' : `bitmesine ${left} gün kaldı`;
    render(eb, html`<span style="flex:1;min-width:200px">${tn.trial ? 'Ücretsiz deneme sürenizin' : 'Aboneliğinizin'} ${when}. Süre bitince panele giriş ve kanallarla senkron durur; verileriniz silinmez.</span><a class="btn sm" href="#/paketim">Paket seçin / yenileyin</a>`);
  } else if (eb) eb.remove();
  const n = s.pending.filter((p) => p.status === 'new').reduce((a, p) => a + p.n, 0);
  const counts = { orders: n, questions: s.questions || 0, claims: s.claims || 0, match: s.unmatched || 0, notices: (s.notices && s.notices.open) || 0, stock: s.stockOut || 0, cargo: s.cargoWaiting || 0 };
  counts.support = state.supportCount || 0;
  $$('[data-count]').forEach((el) => { const v = el.dataset.count.split('+').reduce((a, k) => a + (counts[k] || 0), 0); el.textContent = v > 99 ? '99+' : v; el.classList.toggle('hide', !v); el.classList.toggle('warn', /match|stock/.test(el.dataset.count)); });
  const chs = state.channels.filter((c) => !c.paused);
  const on = chs.filter((c) => c.enabled), err = chs.filter((c) => c.enabled && !c.demo && c.last && (!c.last.ok || c.last.listingsError));
  const box = $('[data-status]');
  box.classList.toggle('warn', !!err.length || !on.length);
  render(box, html`<span class="led"></span><div><b>${on.length} kanal bağlı</b><span>${err.length ? `${err.length} kanalda hata` : on.some((c) => c.demo) ? 'Örnek veriyle çalışıyor' : on.length ? `Son senkron ${ago(Math.max(...on.map((c) => (c.last && c.last.at) || 0))) || '—'}` : 'Entegrasyonları tamamlayın'}</span></div>`);
  $('[data-bell-dot]').classList.toggle('hide', !((s.notices && s.notices.unread) || n));
  // Menüde firma unvanı yerine ürün adı (unvan kurumsal görünmüyordu)
  const logo = (s.settings && s.settings.logo) || 'logo.webp';
  // Varsayılan logoda ürün adı zaten yazılı: tekrar edilmez; firmanın kendi logosu varsa altında ürün adı görünür
  $('[data-company]').textContent = logo === 'logo.webp' ? '' : BRAND;
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

let current = null, currentPath = null, routeSeq = 0, routeAt = 0;
// Ön yükleme: her sayfanın açılışta okuduğu adresler (ilk ziyarette varsayılanlar, sonra öğrenilen gerçek adresler)
const PREFETCH = {
  '': ['summary'], siparisler: ['orders?status=new&page=1&limit=25'], kargo: ['packages?state=waiting'], iadeler: ['claims?page=1&status=waiting'],
  sorular: ['questions?page=1&limit=30&status=waiting'], 'kanal-urunleri': ['channel-products/channels'], urunler: ['products?page=1&limit=40&group=1&sort=sold'], stoklar: ['products?page=1&limit=50&sort=sold', 'dashboard'],
  ...store.get('prefetch', {}),
};
const learn = (path, list) => {
  const l = list.filter((p) => p !== 'summary' && !/[?&]q=/.test(p) && !/^(logs|backfill)/.test(p)).slice(0, 4);
  if (!l.length || JSON.stringify(PREFETCH[path]) === JSON.stringify(l)) return;
  PREFETCH[path] = l;
  store.set('prefetch', Object.fromEntries(Object.entries(PREFETCH).filter(([k]) => k)));
};
export function prefetchRoute(path) {
  const r = PAGES.find((x) => x.path === path);
  if (!r || !canSee(r) || !state.summary) return;
  (PREFETCH[path] || []).forEach(prefetch);
}
// Boşta ön yükleme: ilk sayfa açıldıktan sonra tarayıcı boşaldıkça en sık açılan sayfaların verisi sırayla (aralıklı) önbelleğe alınır;
// menüden ilk geçişte sayfa sunucuyu beklemeden önbellekten açılır (arka planda tazelenir). Veri tasarrufu modunda yapılmaz.
let warmed = false;
function warmIdle() {
  if (warmed || !state.summary || (navigator.connection && navigator.connection.saveData)) return;
  warmed = true;
  const list = ['siparisler', 'kargo', 'urunler', 'stoklar', '', 'kanal-urunleri', 'sorular', 'iadeler', 'analiz', 'gelir-gider'].filter((p) => p !== currentPath);
  const idle = window.requestIdleCallback ? (f) => window.requestIdleCallback(f, { timeout: 2000 }) : (f) => setTimeout(f, 200);
  let i = 0;
  const next = () => { if (i >= list.length || document.hidden) return; prefetchRoute(list[i++]); setTimeout(() => idle(next), 400); };
  setTimeout(() => idle(next), 1200);
}
// Sayfa iskeleti: veri gelene kadar sayfa boş kalmaz (görünüm ilk çizimde bunu değiştirir)
const SKELETON = html`<div class="skel-page" aria-busy="true" aria-label="Yükleniyor"><div class="skel-row"><span class="skel w40"></span><span class="skel w20"></span></div><div class="skel-card"><span class="skel w30"></span><span class="skel"></span><span class="skel w80"></span><span class="skel w60"></span></div><div class="skel-card"><span class="skel"></span><span class="skel w70"></span><span class="skel w90"></span><span class="skel w50"></span><span class="skel w80"></span></div></div>`;
async function route() {
  const my = ++routeSeq;
  const { path, rest, query } = parseHash();
  const r = PAGES.find((x) => x.path === path && canSee(x)) || PAGES[0];
  $$('[data-path]').forEach((a) => a.classList.toggle('on', a.dataset.path === r.path));
  $$('[data-group]').forEach((a) => a.classList.toggle('on', a.dataset.group === r.group));
  // Gruplu sayfa: grubun diğer sayfaları üstte sekme
  const tabsBox = $('[data-subtabs]'), sibs = r.group ? groupPages(r.group) : [];
  tabsBox.hidden = sibs.length < 2;
  render(tabsBox, sibs.length < 2 ? '' : html`${sibs.map((x) => html`<a href="#/${x.path}" class="${x.path === r.path ? 'on' : ''}"><i class="ico ico-${x.icon}"></i>${x.tab}${x.count ? html`<span class="n hide" data-count="${x.count}"></span>` : ''}</a>`)}`);
  $('[data-title]').textContent = r.group ? GROUPS[r.group].title : r.title;
  document.body.dataset.route = r.path;
  $('[data-sub]').textContent = state.demo ? 'Örnek veriler' : '';
  document.title = `${r.title} · Hastürk CRM`;
  if (current && current.destroy) current.destroy();
  // Her sayfa temiz bir kapsayıcıyla başlar (önceki sayfanın olay dinleyicileri taşınmaz)
  const old = $('#view'), el = old.cloneNode(false);
  render(el, SKELETON);
  old.replaceWith(el);
  if (currentPath !== r.path) window.scrollTo(0, 0);
  currentPath = r.path;
  current = null;
  routeAt = Date.now();
  try {
    // Açılışta önbellekteki veri anında kullanılır (arka planda tazelenir); okunan adresler bir sonraki ön yükleme için öğrenilir
    const rec = [];
    const v = (await swrScope(async () => { recorder.list = rec; try { return await r.view(el, rest, query); } finally { if (recorder.list === rec) recorder.list = null; } })) || null;
    if (!Object.keys(query).length && !rest.length) learn(r.path, rec);
    // Bu arada başka sayfaya geçildiyse geç kalan sayfa sonucu kullanılmaz
    if (my !== routeSeq) { if (v && v.destroy) v.destroy(); return; }
    current = v;
    // Yalnız görüntüleme yetkisi: sayfanın üstünde bilgi (değişiklik düğmeleri sunucuda reddedilir)
    if (r.perm && viewOnly(state.user, r.perm)) el.insertAdjacentHTML('afterbegin', '<div class="notice" style="margin-bottom:12px"><i class="ico ico-eye"></i><div>Bu bölümde <b>yalnız görüntüleme</b> yetkiniz var; değişiklik yapamazsınız.</div></div>');
    performance.mark('route:' + r.path); // hız ölçümü (geliştirici araçları → Performance)
    warmIdle();
  } catch (e) {
    if (my !== routeSeq) return;
    render(el, html`<div class="card"><div class="notice bad"><i class="ico ico-warn"></i><div style="flex:1">Sayfa yüklenemedi: ${e.message}</div><button class="btn sm" data-retry>Tekrar dene</button></div></div>`);
    const b = el.querySelector('[data-retry]'); if (b) b.onclick = () => route();
  }
}

// fresh = false: sayfa açılışında önbellekteki özet anında kullanılır (arka planda tazelenir)
export async function loadSummary(fresh = true) {
  const s = await api('summary', { fresh });
  state.channels = s.channels; state.settings = s.settings; state.summary = s; state.summaryAt = Date.now(); state.user = s.user; state.tenant = s.tenant || null; state.owner = !!s.owner; state.demo = s.demo || s.channels.some((c) => c.demo);
  refreshChrome(s);
  refreshCount();
  // Firma panelinde hata mesajlarından tek tıkla destek talebi (ana panel talepleri kendisi yanıtlar)
  state.reportError = state.tenant ? (err) => openTicketForm({ category: 'bug', subject: 'Hata: ' + String(err).replace(/\s+/g, ' ').slice(0, 90), error: String(err).slice(0, 1500) }) : null;
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
  const theme = themeOf();
  const setTheme = (t) => { store.set('theme', t); applyTheme(); };
  const u = state.user || {};
  popMenu(btn, [
    { icon: 'user', label: `${u.name || ''} · ${u.role === 'admin' ? 'Yönetici' : 'Personel'}${state.tenant ? ` · ${state.tenant.name}` : ''}`, run: () => {} },
    ...(u.id > 0 ? [{ icon: 'key', label: 'Şifremi değiştir', run: changePassword }] : []),
    ...(u.id >= 0 && !u.support ? [{ icon: 'check', label: `İki adımlı doğrulama${u.twofa ? ' (açık)' : ''}`, run: twofaSettings }] : []),
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

// Telefon menüsü: firma / kullanıcı başlığı, menüde arama, bölümlere ayrılmış simge ızgarası, hesap işlemleri
const SEC_TONE = { '': 'blue', 'Satış': 'blue', 'Ürünler': 'purple', 'Raporlar': 'green', 'Sistem': 'gray' };
function moreMenu() {
  const groups = [];
  let cur = { sec: '', items: [] };
  for (const r of ROUTES) {
    if (r.sec) { if (cur.items.length) groups.push(cur); cur = { sec: r.sec, items: [] }; continue; }
    if (r.view && canSee(r) && !r.hidden) cur.items.push(r);
  }
  if (cur.items.length) groups.push(cur);
  // Genel Bakış tek başına bölüm olmasın: Satış bölümünün başına
  if (groups.length > 1 && !groups[0].sec) { groups[1].items.unshift(...groups[0].items); groups.shift(); }
  const u = state.user || {};
  const logo = (state.settings && state.settings.logo) || 'logo.webp';
  const s = sheet({
    title: 'Menü', size: 'menu-sheet',
    body: html`<div class="mm-head"><img src="${logo}" alt=""><div style="min-width:0"><b class="ellipsis">${BRAND}</b><span class="ellipsis">${[u.name && u.name !== 'Yönetici' ? u.name : '', u.role === 'admin' ? 'Yönetici' : 'Personel', state.tenant ? state.tenant.name : ''].filter(Boolean).join(' · ')}</span></div></div>
      <label class="search mm-search"><i class="ico ico-search"></i><input class="input" type="search" placeholder="Menüde ara (ör. kargo, iade, stok)" data-mm-q></label>
      ${groups.map((g) => html`<section class="mm-sec" data-mm-sec><h4>${g.sec || 'Genel'}</h4><div class="mm-grid">${g.items.map((r) => html`<a class="mm-tile ${SEC_TONE[g.sec] || 'blue'} ${currentPath === r.path ? 'on' : ''}" href="#/${r.path}" data-mm="${r.title.toLocaleLowerCase('tr')} ${r.path}"><span class="mm-ic"><i class="ico ico-${r.icon}"></i>${r.count ? html`<span class="mm-n hide" data-count="${r.count}"></span>` : ''}</span><span class="mm-t">${r.title}</span></a>`)}</div></section>`)}
      <div class="mm-list">
        <button data-mm-act="help"><i class="ico ico-help"></i>Bu sayfa nasıl kullanılır?</button>
        <button data-mm-act="sync"><i class="ico ico-sync"></i>Şimdi senkronla<span class="muted tiny" style="margin-left:auto">${ago(Math.max(0, ...state.channels.map((c) => (c.last && c.last.at) || 0)))}</span></button>
        <button data-mm-act="theme"><i class="ico ico-bolt"></i>Görünüm: ${{ light: 'Açık', dark: 'Koyu', auto: 'Cihaza uy' }[themeOf()]}</button>
        ${u.id > 0 ? html`<button data-mm-act="pass"><i class="ico ico-key"></i>Şifremi değiştir</button>` : ''}
        <button data-mm-act="logout" class="danger"><i class="ico ico-x"></i>Çıkış yap</button>
      </div>`,
  });
  refreshChrome();
  const q = $('[data-mm-q]', s.el);
  q.addEventListener('input', () => {
    const v = q.value.trim().toLocaleLowerCase('tr');
    $$('[data-mm]', s.el).forEach((a) => a.classList.toggle('hide', !!v && !a.dataset.mm.includes(v)));
    $$('[data-mm-sec]', s.el).forEach((x) => x.classList.toggle('hide', !$$('[data-mm]:not(.hide)', x).length));
  });
  s.body.addEventListener('click', (e) => {
    if (e.target.closest('a')) return s.close();
    const b = e.target.closest('[data-mm-act]');
    if (!b) return;
    const a = b.dataset.mmAct;
    if (a === 'sync') { s.close(); sync(); }
    if (a === 'help') { s.close(); openHelp(currentPath || '', (page) => openTicketForm({ category: 'question', subject: `${page} sayfası hakkında` })); }
    if (a === 'theme') { const order = ['light', 'dark', 'auto'], t = order[(order.indexOf(themeOf()) + 1) % 3]; store.set('theme', t); applyTheme(); b.lastChild.textContent = `Görünüm: ${{ light: 'Açık', dark: 'Koyu', auto: 'Cihaza uy' }[t]}`; }
    if (a === 'pass') { s.close(); changePassword(); }
    if (a === 'logout') api('logout', { method: 'POST' }).catch(() => {}).then(() => location.reload());
  });
}

// Telefon araması: sipariş, ürün ya da müşteri
function findSheet() {
  const s = sheet({
    title: 'Ara', size: 'narrow',
    body: html`<form class="stack" data-find><label class="search"><i class="ico ico-search"></i><input class="input" type="search" name="q" placeholder="Sipariş no, müşteri, ürün, SKU, barkod" autocomplete="off" enterkeyhint="search"></label>
      <div class="find-acts"><button class="btn primary" name="where" value="siparisler"><i class="ico ico-orders"></i>Siparişlerde ara</button><button class="btn" name="where" value="urunler"><i class="ico ico-box"></i>Ürünlerde ara</button></div></form>`,
  });
  const form = $('[data-find]', s.el), input = form.q;
  setTimeout(() => input.focus(), 50);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim(), where = (e.submitter && e.submitter.value) || 'siparisler';
    if (!v) return input.focus();
    s.close();
    location.hash = `#/${where}?q=${encodeURIComponent(v)}`;
  });
}

// Telefon: sayfanın üstündeki ikincil düğmeler üst çubuktaki ⋯ menüsüne taşınır, "ekle" düğmesi yüzen düğme olur,
// uzun açıklama kutuları iki satıra kısaltılır (dokununca açılır). Görünümlerin kendi düğmeleri aynen çalışır.
function mobileEnhance() {
  const view = $('#view'), more = $('[data-page-more]');
  if (!view || !more) return;
  const mobile = window.matchMedia('(max-width: 899px)').matches;
  const btns = mobile ? $$('.page-actions > .btn:not([data-fab])', view).filter((b) => !b.closest('.sheet-bg')) : [];
  more.classList.toggle('hide', !btns.length);
  more.onclick = () => popMenu(more, btns.map((b) => ({ icon: ((b.querySelector('.ico') || {}).className || '').replace(/.*ico-([a-z-]+).*/, '$1') || null, label: b.textContent.trim(), run: () => b.click() })), { title: $('[data-title]').textContent });
  let fab = $('.fab');
  const src = mobile && $('[data-fab]', view);
  if (!src) { if (fab) fab.remove(); } else {
    if (!fab) { fab = document.createElement('button'); fab.className = 'fab'; document.body.append(fab); }
    fab.innerHTML = src.innerHTML;
    fab.onclick = () => src.click();
  }
  // Uzun bilgi kutuları (telefonda 150, bilgisayarda 260 karakterden uzun) iki satıra kısalır
  for (const n of $$('.notice:not([data-clamp])', view)) {
    n.dataset.clamp = '1';
    const t = n.querySelector(':scope > div');
    if (!t || t.textContent.length < (mobile ? 150 : 260) || t.querySelector('input, select, textarea')) continue;
    t.classList.add('clamp2');
    const b = document.createElement('button');
    b.className = 'more-link'; b.type = 'button'; b.textContent = 'Devamı';
    b.onclick = (e) => { e.stopPropagation(); const open = t.classList.toggle('clamp2'); b.textContent = open ? 'Devamı' : 'Kısalt'; };
    t.after(b);
  }
}
let enhTimer = 0;
new MutationObserver(() => { cancelAnimationFrame(enhTimer); enhTimer = requestAnimationFrame(mobileEnhance); }).observe(document.querySelector('.main'), { childList: true, subtree: true });
window.addEventListener('resize', debounceEnh);
function debounceEnh() { cancelAnimationFrame(enhTimer); enhTimer = requestAnimationFrame(mobileEnhance); }

// Cloudflare Turnstile (insan doğrulaması): sunucuda anahtar tanımlıysa giriş ve şifremi unuttum formlarında gösterilir.
// Her doğrulama tek kullanımlıktır: başarısız denemeden sonra yenilenir.
let tsLoad = null;
function turnstile(el, sitekey, action) {
  const st = { token: '', id: null, on: !!sitekey, reset() { this.token = ''; if (this.id != null && window.turnstile) window.turnstile.reset(this.id); } };
  if (!sitekey || !el) return st;
  tsLoad = tsLoad || new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; sc.async = true; sc.onload = ok; sc.onerror = no; document.head.append(sc); });
  tsLoad.then(() => { st.id = window.turnstile.render(el, { sitekey, action, language: 'tr', theme: 'light', size: 'flexible', callback: (t) => { st.token = t; }, 'expired-callback': () => { st.token = ''; }, 'error-callback': () => { st.token = ''; } }); })
    .catch(() => { el.textContent = 'Güvenlik doğrulaması yüklenemedi; sayfayı yenileyin.'; });
  return st;
}
let tsKey = '';

// Şifremi unuttum: firma kodu + kullanıcı adı / e-posta → e-postaya yenileme bağlantısı (müşteri panelleri)
function forgotForm(box, tenant, who) {
  render($('.login-card', box), html`<div><h2>Şifremi unuttum</h2><div class="muted small">Kullanıcınıza kayıtlı e-posta adresine şifre yenileme bağlantısı gönderilir.</div></div>
    <label class="field"><span>Firma kodu</span><input class="input" name="ft" autocapitalize="none" value="${tenant}" placeholder="ör. ornek-firma"></label>
    <label class="field"><span>Kullanıcı adı ya da e-posta</span><input class="input" name="fw" autocapitalize="none" value="${who}"></label>
    <div class="ts-box" data-ts></div>
    <div class="login-err" data-err role="alert"></div><div class="notice hide" data-ok></div>
    <button class="btn primary block lg" type="submit">Bağlantı gönder</button>
    <button type="button" class="link-btn" data-back>Girişe dön</button>`);
  const f = $('.login-card', box), ts = turnstile($('[data-ts]', f), tsKey, 'forgot');
  $('[data-back]', f).onclick = () => { box.remove(); login(); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const t = f.ft.value.trim().toLocaleLowerCase('tr'), w = f.fw.value.trim();
    if (!t || !w) { $('[data-err]', f).textContent = 'Firma kodunu ve kullanıcı adınızı (ya da e-postanızı) girin'; return; }
    if (ts.on && !ts.token) { $('[data-err]', f).textContent = 'Güvenlik doğrulamasının tamamlanmasını bekleyin'; return; }
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try { const r = await api('password/forgot', { method: 'POST', body: { tenant: t, who: w, cf: ts.token } }); $('[data-err]', f).textContent = ''; const ok = $('[data-ok]', f); ok.textContent = r.message; ok.classList.remove('hide'); }
    catch (x) { $('[data-err]', f).textContent = x.message; }
    ts.reset();
    btn.disabled = false;
  };
}
// E-postadaki bağlantı (#/sifre/firma.anahtar): yeni şifre belirleme
function resetForm(key) {
  const box = document.createElement('div');
  box.className = 'login';
  render(box, html`<div class="login-hero"><div class="login-logo"><img src="logo.webp" alt="Logo"></div><div class="login-sub">Satış yönetim paneli</div></div>
    <form class="login-card stack" novalidate>
      <div><h2>Yeni şifre belirleyin</h2><div class="muted small">En az 8 karakter. Şifre değişince diğer cihazlardaki oturumlar kapanır.</div></div>
      <label class="field"><span>Yeni şifre</span><input class="input" type="password" name="p1" autocomplete="new-password" required></label>
      <label class="field"><span>Yeni şifre (tekrar)</span><input class="input" type="password" name="p2" autocomplete="new-password" required></label>
      <div class="login-err" data-err role="alert"></div>
      <button class="btn primary block lg" type="submit">Şifreyi kaydet</button>
    </form>`);
  document.body.prepend(box);
  const f = $('form', box);
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (f.p1.value.length < 8) { $('[data-err]', f).textContent = 'Şifre en az 8 karakter olmalı'; return; }
    if (f.p1.value !== f.p2.value) { $('[data-err]', f).textContent = 'Şifreler aynı değil'; return; }
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await api('password/reset', { method: 'POST', body: { key, password: f.p1.value } });
      store.set('firma', r.tenant);
      history.replaceState(null, '', location.pathname + location.search);
      box.remove(); toast('Şifreniz kaydedildi; yeni şifrenizle giriş yapın'); login();
    } catch (x) { $('[data-err]', f).textContent = x.message; btn.disabled = false; }
  };
}
async function login(info = {}) {
  closeAllSheets();
  $$('.side, .main, .tabbar').forEach((e) => e.classList.add('hide'));
  if ($('.login')) return;
  const rk = /^#\/sifre\/([a-z0-9-]+\.[0-9a-f]{48})$/.exec(location.hash);
  if (rk) return resetForm(rk[1]);
  const brand = await fetch('/api/brand').then((r) => r.json()).catch(() => ({}));
  // Müşteri paneli: firma kodu adresle (?firma=kod) gelebilir; son kullanılan hatırlanır
  const qs = new URLSearchParams(location.search), firma = qs.get('firma') || store.get('firma', '');
  // Ana panel (yönetim) girişi giriş ekranında görünmez: yalnız ?yonetim adresiyle ya da bu cihazda daha önce yönetim girişi yapıldıysa açılır
  const owner = qs.has('yonetim') || brand.demo || info.demo || info.setup || (!firma && store.get('yonetim', false));
  const box = document.createElement('div');
  box.className = 'login';
  // Firma kodu yalnız müşteri panelleri için: hatırlanan kod yoksa "Firma koduyla giriş" bağlantısının arkasında durur
  render(box, html`<div class="login-hero"><div class="login-logo"><img src="${brand.logo || 'logo.webp'}" alt="${brand.title || 'Logo'}"></div>
      <div class="login-sub">${BRAND} · Satış yönetim paneli</div></div>
    <form class="login-card stack" novalidate>
      <div><h2>Hoş geldiniz</h2><div class="muted small">Devam etmek için giriş yapın</div></div>
      ${info.setup ? html`<div class="notice warn"><i class="ico ico-warn"></i><div>Panel şifresi henüz tanımlanmamış. Cloudflare → Worker → Settings → Variables and Secrets bölümüne <b>PANEL_PASSWORD</b> ekleyin.</div></div>` : ''}
      ${info.demo || brand.demo ? html`<div class="notice"><i class="ico ico-bolt"></i><div>Deneme modu: kullanıcı adı boş, şifre <b>demo</b></div></div>` : ''}
      <label class="field ${owner ? 'hide' : ''}" data-firma><span>Firma kodu</span><input class="input" name="tenant" autocomplete="organization" autocapitalize="none" placeholder="ör. ornek-firma" value="${owner ? '' : firma}"></label>
      <label class="field"><span>Kullanıcı adı</span><input class="input" name="username" autocomplete="username" autocapitalize="none" placeholder="${owner ? 'Yönetici için boş bırakın' : 'Kullanıcı adınız'}"></label>
      <label class="field"><span>Şifre</span><span class="pw"><input class="input" type="password" name="password" autocomplete="current-password" required><button type="button" class="icon-btn sm" data-eye aria-label="Şifreyi göster"><i class="ico ico-eye"></i></button></span></label>
      <div class="ts-box" data-ts></div>
      <div class="login-err" data-err role="alert"></div>
      <button class="btn primary block lg" type="submit">Giriş yap</button>
      ${owner ? html`<button type="button" class="link-btn" data-firma-toggle>Firma koduyla giriş</button>` : ''}
      <button type="button" class="link-btn ${owner ? 'hide' : ''}" data-forgot>Şifremi unuttum</button>
    </form>
    <div class="login-foot">Hastürk CRM · güvenli bağlantı</div>`);
  document.body.prepend(box);
  tsKey = brand.turnstile || '';
  const ts = turnstile($('[data-ts]', box), tsKey, 'login');
  $(owner ? '[name=password]' : firma ? '[name=username]' : '[name=tenant]', box).focus();
  $('[data-eye]', box).onclick = (e) => { const i = $('[name=password]', box); i.type = i.type === 'password' ? 'text' : 'password'; e.currentTarget.classList.toggle('on', i.type === 'text'); };
  $('[data-forgot]', box).onclick = () => forgotForm(box, $('[name=tenant]', box).value.trim().toLocaleLowerCase('tr'), $('[name=username]', box).value.trim());
  const tg = $('[data-firma-toggle]', box);
  if (tg) tg.onclick = (e) => {
    $('[data-firma]', box).classList.remove('hide'); $('[data-forgot]', box).classList.remove('hide');
    $('[name=username]', box).placeholder = 'Kullanıcı adınız'; $('[name=tenant]', box).focus(); e.currentTarget.remove();
  };
  $('form', box).onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    if (!e.target.password.value) { $('[data-err]', box).textContent = 'Şifrenizi girin'; return e.target.password.focus(); }
    if (!$('[data-firma]', box).classList.contains('hide') && !e.target.tenant.value.trim()) { $('[data-err]', box).textContent = 'Firma kodunuzu girin'; return e.target.tenant.focus(); }
    if (ts.on && !ts.token) { $('[data-err]', box).textContent = 'Güvenlik doğrulamasının tamamlanmasını bekleyin'; return; }
    btn.disabled = true; btn.innerHTML = '<i class="ico ico-sync spin"></i>Giriş yapılıyor';
    try {
      const tenant = e.target.tenant.value.trim().toLocaleLowerCase('tr');
      let r = await api('login', { method: 'POST', body: { tenant, username: e.target.username.value.trim(), password: e.target.password.value, cf: ts.token } });
      ts.reset();
      // İki adımlı doğrulama: form kod adımına dönüşür (bilet 5 dakika geçerli)
      if (r.twofa) {
        try { r = await codeStep(e.target, { ticket: r.ticket, tenant }); } catch (x) { box.remove(); toast(x.message, true); return login(); }
        if (r.recoveryUsed) toast(`Yedek kodla giriş yapıldı; ${r.recoveryLeft} yedek kod kaldı`);
      }
      // Tanınmayan ağdan giriş: e-postaya giden kod (bilet 20 dakika geçerli)
      if (r.emailcode) {
        try { r = await mailStep(e.target, { ticket: r.ticket, tenant, to: r.to }); } catch (x) { box.remove(); toast(x.message, true); return login(); }
      }
      store.set('firma', tenant); store.set('yonetim', !tenant);
      box.remove();
      $$('.side, .main, .tabbar').forEach((x) => x.classList.remove('hide'));
      start();
    } catch (err) { ts.reset(); $('[data-err]', box).textContent = err.message; btn.disabled = false; btn.textContent = 'Giriş yap'; }
  };
}
state.onLogin = (info) => login(info);
state.onNeed2fa = () => forcedSetup();

// Uygulama dosyaları cihazda saklanır (sw.js). Yeni yayın çıktıysa saklananlar silinir ve sayfa bir kez yenilenir.
function shellCache(build) {
  if (!('serviceWorker' in navigator) || /^(localhost|127\.)/.test(location.hostname)) return;
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  if (!build) return;
  const old = store.get('build', null);
  store.set('build', build);
  // Yeni yayın: saklanan dosyalar silinir; sayfa YENİLENMEZ (yayın yayılırken eski / yeni sürüm sırayla gelince yenileme döngüsü olmasın).
  // Uygulama dosyaları zaten ağdan öncelikli alınır (sw.js); eski CSS + yeni JS karışırsa assetsMatch bir kez yeniler.
  if (old && old !== build && window.caches) caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).catch(() => {});
}

// Dosya sürümü (app.css → --assets ile aynı). Eski CSS ile yeni JS (ya da tersi) açıldıysa saklananlar silinip bir kez yenilenir.
const ASSETS = '2026-10-09d';
state.assets = ASSETS;
function assetsMatch() {
  const css = getComputedStyle(document.documentElement).getPropertyValue('--assets').trim().replace(/"/g, '');
  if (css === ASSETS) return true;
  let last = 0;
  try { last = Number(sessionStorage.getItem('assets_reload')) || 0; sessionStorage.setItem('assets_reload', String(Date.now())); } catch { /* yok */ }
  if (Date.now() - last < 60e3) return true; // döngüye girmesin
  (window.caches ? caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))) : Promise.resolve()).finally(() => location.reload());
  return false;
}

// Açılış: özet alınamazsa (yeni yayın anı, geçici sunucu hatası) boş ekranda kalınmaz — kendiliğinden 3 kez yeniden denenir,
// sonra "Tekrar dene" düğmesi gösterilir. Giriş gerekiyorsa giriş ekranı açılmıştır (login), bir şey yapılmaz.
async function start(attempt = 0) {
  if (!attempt && !assetsMatch()) return;
  try { await loadSummary(); } catch (e) {
    if (e.auth || document.querySelector('.login')) return;
    const view = $('#view'), wait = [2, 5, 10][attempt];
    if (view) render(view, html`<div class="empty" data-boot-error style="padding:48px 16px"><i class="ico ico-warn"></i><div style="margin:8px 0"><b>Panel açılamadı.</b> ${e.message}</div>
      ${wait ? html`<div class="muted small">${wait} sn içinde yeniden denenecek…</div>` : ''}<button class="btn primary" data-boot-retry style="margin-top:10px"><i class="ico ico-sync"></i>Tekrar dene</button></div>`);
    const retry = () => { clearTimeout(t); start(attempt + 1); };
    const t = wait ? setTimeout(retry, wait * 1000) : null;
    const b = $('[data-boot-retry]'); if (b) b.onclick = () => (attempt >= 3 ? location.reload() : retry());
    window.__booted = true;
    return;
  }
  window.__booted = true;
  shellCache(state.summary.build);
  nav();
  refreshChrome();
  await route();
  // Boşta: alt menüdeki sayfaların verisi önceden alınır (ilk dokunuşta da beklemeden açılsın)
  setTimeout(() => ['siparisler', 'kargo', 'stoklar', 'urunler'].forEach(prefetchRoute), 1200);
}

// Yan menü: geniş ↔ dar (yalnız simgeler). Tercih bu cihazda hatırlanır.
function setSide(mini) {
  document.body.classList.toggle('nav-mini', mini);
  store.set('nav-mini', mini);
  $$('[data-act=side]').forEach((b) => { b.title = mini ? 'Menüyü genişlet' : 'Menüyü daralt'; b.setAttribute('aria-label', b.title); });
}
setSide(store.get('nav-mini', false));

applyTheme();
window.addEventListener('hashchange', route);
// Arka planda tazelenen veri değiştiyse açık sayfa sessizce yeniden çizilir (kullanıcı yazı yazarken dokunulmaz)
let updTimer = null;
window.addEventListener('api:update', () => {
  clearTimeout(updTimer);
  updTimer = setTimeout(() => {
    const a = document.activeElement;
    if (!current || !current.refresh || Date.now() - routeAt > 20e3 || (a && a.closest && a.closest('#view') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
    Promise.resolve(current.refresh()).catch(() => {});
  }, 120);
});
// Ön yükleme: menü bağlantısına dokunulunca (telefon) ya da imleç üstüne gelince (bilgisayar) sayfa verisi önceden istenir;
// sipariş satırına dokununca sipariş detayı. Parmak kalkana kadar geçen ~100-200 ms'de veri yola çıkmış olur.
const warm = (e) => {
  const t = e.target.closest && e.target.closest('a[href^="#/"], [data-row], [data-act=open][data-o]');
  if (!t || !state.summary) return;
  if (t.matches('a')) return prefetchRoute(t.getAttribute('href').replace(/^#\/?/, '').split(/[/?]/)[0]);
  const id = t.dataset.row || t.dataset.o;
  if (id && can(state.user, 'orders')) prefetch('orders/' + encodeURIComponent(id));
};
document.addEventListener('pointerdown', warm, { passive: true });
document.addEventListener('mouseover', (e) => { if (e.target.closest && e.target.closest('.side, .tabbar')) warm(e); }, { passive: true });
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b || b.closest('#view') || b.closest('.sheet-bg')) return;
  const a = b.dataset.act;
  if (a === 'sync') { e.preventDefault(); sync(); }
  if (a === 'bell') { e.preventDefault(); bell(b); }
  if (a === 'me') { e.preventDefault(); meMenu(b); }
  if (a === 'more') { e.preventDefault(); moreMenu(); }
  if (a === 'find') { e.preventDefault(); findSheet(); }
  if (a === 'help') { e.preventDefault(); openHelp(currentPath || '', (page) => openTicketForm({ category: 'question', subject: `${page} sayfası hakkında` })); }
  if (a === 'side') { e.preventDefault(); setSide(!document.body.classList.contains('nav-mini')); }
});
// Üst arama: yazarken sipariş ve ürün sonuçları açılır (ok tuşları + Enter); Enter tüm siparişlerde arar
(() => {
  const input = $('[data-global-search]'), box = document.createElement('div');
  box.className = 'gs-pop'; box.hidden = true; input.closest('.search').append(box);
  let seq = 0, timer = 0, items = [], idx = -1;
  const close = () => { box.hidden = true; idx = -1; };
  const go = (href) => { close(); input.value = ''; input.blur(); location.hash = href; };
  const mark = () => $$('.gs-it', box).forEach((x, i) => x.classList.toggle('on', i === idx));
  async function run(q) {
    const my = ++seq;
    const can2 = (k) => !state.user || can(state.user, k);
    const [o, p] = await Promise.all([
      can2('orders') ? api(`orders?q=${encodeURIComponent(q)}&status=all&limit=5`).catch(() => null) : null,
      can2('products') ? api(`products?q=${encodeURIComponent(q)}&limit=5`).catch(() => null) : null,
    ]);
    if (my !== seq) return;
    const os = (o && o.orders) || [], ps = (p && p.products) || [];
    items = [...os.map((x) => `#/siparisler/${encodeURIComponent(x.id)}`), ...ps.map((x) => `#/urunler?q=${encodeURIComponent(x.sku || x.name)}`), `#/siparisler?q=${encodeURIComponent(q)}`];
    let i = 0;
    render(box, html`${os.length ? html`<div class="gs-h">Siparişler</div>${os.map((x) => html`<a class="gs-it" data-i="${i++}" href="${items[i - 1]}"><i class="ico ico-orders"></i><span class="ellipsis"><b>#${x.order_number}</b> · ${x.customer || ''}</span><span class="muted tiny">${ch(x.channel).name || ''}</span></a>`)}` : ''}
      ${ps.length ? html`<div class="gs-h">Ürünler</div>${ps.map((x) => html`<a class="gs-it" data-i="${i++}" href="${items[i - 1]}"><i class="ico ico-box"></i><span class="ellipsis"><b>${x.name}</b>${x.variant_name ? ` · ${x.variant_name}` : ''}</span><span class="muted tiny">${x.sku || ''}</span></a>`)}` : ''}
      ${!os.length && !ps.length ? html`<div class="gs-empty muted small">“${q}” için sonuç yok</div>` : ''}
      <a class="gs-it gs-all" data-i="${i++}" href="${items[items.length - 1]}"><i class="ico ico-search"></i><span>Tüm siparişlerde ara: <b>${q}</b></span></a>`);
    box.hidden = false; idx = -1;
  }
  input.addEventListener('input', () => { clearTimeout(timer); const q = input.value.trim(); if (q.length < 2) { close(); return; } timer = setTimeout(() => run(q), 220); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (!box.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); idx = Math.max(0, Math.min(items.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1))); mark(); return; }
    if (e.key !== 'Enter') return;
    const q = input.value.trim();
    if (!q) return;
    go(idx >= 0 && items[idx] ? items[idx] : '#/siparisler?q=' + encodeURIComponent(q));
  });
  box.addEventListener('click', (e) => { const a = e.target.closest('a.gs-it'); if (a) { e.preventDefault(); go(a.getAttribute('href')); } });
  input.addEventListener('blur', () => setTimeout(close, 180));
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2 && box.childElementCount) box.hidden = false; });
})();
// Özet 3 dakikada bir tazelenir; sekme arka plandayken sunucu boşuna meşgul edilmez (öne gelince hemen tazelenir)
setInterval(() => { if (document.visibilityState === 'visible') loadSummary().catch(() => {}); }, 3 * 60e3);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.summary && Date.now() - (state.summaryAt || 0) > 3 * 60e3) loadSummary().catch(() => {}); });
start();
export { ago };
