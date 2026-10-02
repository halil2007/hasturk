/*! Mağaza arama widget'ı — ikas için. Tek satırla eklenir (async: sitenin büyük paketlerini beklemeden çalışır):
 *  <script src="https://hasturk-arama.halilc2007.workers.dev/pm-search.js" async fetchpriority="high"></script>
 *  Kaynak: widget/pm-search.js — derleme: node scripts/build-widget.mjs
 *  İsteğe bağlı data-* ayarları:
 *   data-selector  hangi arama kutuları yakalansın (CSS seçici)
 *   data-trigger   tıklanınca aramayı açacak ek öğeler (örn. büyüteç ikonu)
 *   data-json      products.json adresi (varsayılan: script ile aynı klasör)
 *   data-site      ikinci mağaza klasörü (örn. "tarim" → tarim/products.json, tarim/menu.json; kendi ürün ve renkleri)
 *   data-store     mağaza adresi (varsayılan: bulunulan site)
 *   data-fab       "off" → sağ alttaki "Ürün Bul" butonunu gösterme
 *   data-auto      "off" → sitedeki arama butonlarını otomatik tanıma
 */
(function () {
  'use strict';
  if (window.UrunArama || window.name === 'ua-sepet-cercevesi') return;

  var script = document.currentScript || document.querySelector('script[src*="pm-search"]');
  var ds = (script && script.dataset) || {};
  var BASE = script ? new URL('.', script.src).href : '/';
  // data-site="tarim": ikinci mağazanın verisi (public/tarim/: kendi ürünleri, fiyatları, ayar ve renkleri)
  var SITE_DIR = /^[a-z0-9-]+$/.test(ds.site || '') ? ds.site + '/' : '';
  var JSON_URL = ds.json || BASE + SITE_DIR + 'products.json';
  var MENU_URL = ds.menu === 'off' ? '' : (ds.menuJson || BASE + SITE_DIR + 'menu.json'); // ~5 KB: menü/ana ekran anında açılsın
  var STORE = (ds.store || location.origin).replace(/\/$/, '');
  var SELECTOR = ds.selector || 'input[type="search"], input[name="q"], input[name="s"], input[placeholder]';
  var TRIGGER = ds.trigger || '';
  var CACHE_KEY = 'ua-data-v5'; // veri/ayar biçimi değişince artır (eski önbellek kullanılmasın)
  var RECENT_KEY = 'ua-recent';
  var CACHE_MS = 20 * 60 * 1000;
  var PAGE = 10;
  var DM_NEED = false, PREP_NOW = null; // masaüstü menü veriyi hemen ister / panel açılınca bekleyen hazırlık hemen yapılır
  var T_EXEC = window.performance && performance.now ? Math.round(performance.now()) : 0; // #ua-debug: kod ne zaman çalıştı
  var idle = window.requestIdleCallback ? function (f, t) { window.requestIdleCallback(f, { timeout: t }); } : function (f, t) { setTimeout(f, Math.min(t, 200)); };
  // Yavaş bağlantı / veri tasarrufu: ürün görselleri daha küçük boyutta istenir
  function slowNet() { var c = navigator.connection; return !!(c && (c.saveData || /(^|-)2g|3g/.test(c.effectiveType || ''))); }

  // ---------------- Türkçe normalizasyon ----------------
  var FOLD = { 'ı': 'i', 'ş': 's', 'ğ': 'g', 'ü': 'u', 'ö': 'o', 'ç': 'c', 'â': 'a', 'î': 'i', 'û': 'u' };
  var FOLD_RE = /[ışğüöçâîû]/g, foldCh = function (c) { return FOLD[c]; };
  function fold(s) {
    // Tüm metni bir kerede küçült (harf harf yapmaktan ~17 kat hızlı, sonuç aynı)
    return String(s || '').toLocaleLowerCase('tr-TR').replace(FOLD_RE, foldCh).replace(/\u0307/g, '');
  }
  function words(s) { return s.split(/[^a-z0-9]+/).filter(Boolean); }
  function lev(a, b) {
    var m = a.length, n = b.length;
    if (Math.abs(m - n) > 1) return 2;
    var prev = [], cur, i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function tl(n) {
    return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' TL';
  }
  // Sepet tutarı (ücretsiz kargo çubuğu için): sitenin sepet/GraphQL yanıtlarındaki ikas sepet nesnesinden okunur
  var CART = null, CART_N = null, CART_ID = null, CART_KEY = 'ua-cart';
  try { var cs0 = JSON.parse(sessionStorage.getItem(CART_KEY) || 'null'); if (cs0 && Date.now() - cs0.t < 6 * 3600e3) { CART = cs0.v; CART_N = cs0.n != null ? cs0.n : null; CART_ID = cs0.id || null; CART_LINES = cs0.l || null; } } catch (e) {}
  function findCart(o, d) {
    if (!o || typeof o !== 'object' || d > 7) return null;
    if (Array.isArray(o.orderLineItems) && (o.totalFinalPrice != null || o.totalPrice != null)) return o;
    for (var k in o) if (o[k] && typeof o[k] === 'object') { var r = findCart(o[k], d + 1); if (r) return r; }
    return null;
  }
  // Sepetteki satırlar: varyant kimliği → adet
  var CART_LINES = null;
  function lineQty(c) {
    var m = {};
    (c.orderLineItems || []).forEach(function (it) {
      var id = it && (it.variant && it.variant.id || it.variantId || it.productVariantId);
      if (id) m[id] = (m[id] || 0) + (+it.quantity || 1);
    });
    return m;
  }
  function setCart(o) {
    var c = findCart(o, 0);
    if (!c) return;
    var v = c.orderLineItems.length ? +(c.totalFinalPrice != null ? c.totalFinalPrice : c.totalPrice) : 0;
    if (isNaN(v)) return;
    CART = v;
    CART_N = c.orderLineItems.reduce(function (a, it) { return a + (+(it && it.quantity) || 1); }, 0);
    var prevLines = CART_LINES;
    CART_LINES = lineQty(c);
    // Sitenin herhangi bir yerinden sepete eklenen ürünler (ikas'ın kendi butonu dahil) eğilim verisine yazılır
    if (prevLines) for (var vid in CART_LINES) if (CART_LINES[vid] > (prevLines[vid] || 0)) cartAdded(vid);
    if (c.id) CART_ID = c.id;
    try { sessionStorage.setItem(CART_KEY, JSON.stringify({ v: v, n: CART_N, t: Date.now(), id: CART_ID, l: CART_LINES })); } catch (e) {}
    updateShip();
  }
  function sniffCart(w) {
    try {
      var of = w.fetch;
      if (of && !of.__uaCart) {
        w.fetch = function (u, o) {
          // Sadece sepetle ilgili istekler (adresinde ya da gövdesinde "cart" geçen); ürün listesi vb. cevaplar açılmaz
          var isCartReq = false;
          try { isCartReq = /cart|sepet/i.test(String(u && u.url || u)) || (o && typeof o.body === 'string' && /cart/i.test(o.body.slice(0, 2000))); } catch (e) {}
          return of.apply(this, arguments).then(function (r) {
            try {
              if (isCartReq && r && /json/i.test(r.headers.get('content-type') || '')) r.clone().json().then(setCart, function () {});
            } catch (e) {}
            return r;
          });
        };
        w.fetch.__uaCart = true;
      }
      var X = w.XMLHttpRequest && w.XMLHttpRequest.prototype;
      if (X && !X.__uaCart) {
        X.__uaCart = true;
        var oo = X.open, os = X.send;
        X.open = function (m, u) { this.__uaU = u; return oo.apply(this, arguments); };
        X.send = function (b) {
          if (/cart|sepet/i.test(String(this.__uaU || '')) || (typeof b === 'string' && /cart/i.test(b.slice(0, 2000)))) this.addEventListener('load', function () {
            try { setCart(this.responseType === 'json' ? this.response : JSON.parse(this.responseText)); } catch (e) {}
          });
          return os.apply(this, arguments);
        };
      }
    } catch (e) {}
  }
  sniffCart(window);
  var HIDDEN_TAG = /^kdv[\s_-]*\d+$/i; // muhasebe etiketleri aramada/rozette görünmesin

  // ---------------- Veri ----------------
  var DATA = null, CATS_BY_ID = {}, KIDS = {}, SYN = {}, CFG = {}, loading = null, BY_VAR = {}, BY_SLUG = {};
  // Hızlı menü verisi (menu.json): kategoriler + ana ekran ayarları. Ürün verisi (DATA) gelene kadar ☰ menüsü ve
  // Ürün Bul ana ekranı bununla çizilir; ürün listeleri ve arama ürün verisini bekler.
  var LITE = null, liteLoading = null;
  function SRC() { return DATA || LITE; }
  function itemCount() { return DATA ? DATA.items.length : LITE ? LITE.n || 0 : 0; }
  function catsIndex(cats) {
    CATS_BY_ID = {};
    KIDS = {};
    cats.forEach(function (c) { CATS_BY_ID[c.id] = c; c.f = fold(c.n); });
    cats.forEach(function (c) { if (c.p && CATS_BY_ID[c.p]) (KIDS[c.p] = KIDS[c.p] || []).push(c); });
  }
  function loadLite() {
    if (DATA || LITE || liteLoading || !MENU_URL) return liteLoading || Promise.resolve();
    liteLoading = fetch(MENU_URL, { credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (m) {
        if (DATA || !m || !m.cats) return;
        LITE = m;
        CFG = m.config || {};
        catsIndex(m.cats);
        applyConfig();
      })
      .catch(function () {}); // menü verisi yoksa ürün verisi beklenir (eski davranış)
    return liteLoading;
  }

  function prepare(d) {
    DATA = d;
    CFG = d.config || {};
    SYN = {};
    Object.keys(CFG.synonyms || {}).forEach(function (k) {
      SYN[fold(k)] = (CFG.synonyms[k] || []).map(fold);
    });
    SOIL = null;
    catsIndex(d.cats);
    d.items.forEach(function (p) {
      p.t = (p.t || []).filter(function (t) { return !HIDDEN_TAG.test(t); });
      var catNames = p.c.map(function (id) { return CATS_BY_ID[id] ? CATS_BY_ID[id].n : ''; }).join(' ');
      var varNames = (p.v || []).map(function (v) { return v.name || ''; }).join(' ');
      p.nf = fold(p.n);
      p.hay = fold([p.n, p.b || '', catNames, p.t.join(' '), varNames].join(' '));
      p.w = words(p.hay);
      p.nw = words(p.nf);
      var leaf = p.c.map(function (id) { return CATS_BY_ID[id]; }).filter(Boolean)
        .sort(function (a, b) { return (b.p ? 1 : 0) - (a.p ? 1 : 0); })[0];
      p.cn = leaf ? leaf.n : '';
    });
    // Satış önceliği: config.json > boost'taki ürünler (sıraya göre) ve mağaza markası öne,
    // ton/toptan gibi büyük hacimli ürünler (bulkPattern veya bulkPrice üstü) geriye
    var boost = (CFG.boost || []).slice().reverse(), ownB = new RegExp(CFG.brandPattern || 'has ?t[uü]rk|^hg$', 'i');
    var bulk = new RegExp(CFG.bulkPattern || '\\b\\d+([.,]\\d+)? ?ton\\b', 'i'), bulkPrice = CFG.bulkPrice || 40000;
    d.items.forEach(function (p) {
      var b = boost.indexOf(p.s);
      p.own = ownB.test(p.b || '');
      // "Çok satan": config'deki liste + gerçek siparişlerde en çok satanlar (sync.mjs > trend.best)
      p.best = (CFG.bestsellers || CFG.boost || []).indexOf(p.s) !== -1 || ((d.trend || {}).best || []).indexOf(p.s) !== -1;
      p.r = (b !== -1 ? 4 + b / Math.max(boost.length, 1) : 0) + (p.own ? 2 : 0) + (p.st ? Math.min(2, (p.h || 0) / 50) : 0);
      if (bulk.test(p.n) || (p.p || 0) >= bulkPrice) p.r -= 8;
    });
    // Kategori görseli: config.json > categoryImages'daki ürün; yoksa kategorideki (alt kategoriler dahil)
    // stoktaki mağaza markalı ürün; o da yoksa stoktaki ilk görselli ürün
    var bySlug = {}, cover = {}, own = new RegExp(CFG.brandPattern || 'has ?t[uü]rk|^hg$', 'i');
    d.items.forEach(function (p) { bySlug[p.s] = p; });
    BY_SLUG = bySlug;
    BY_VAR = {};
    d.items.forEach(function (p) {
      if (p.v1) BY_VAR[p.v1] = p;
      (p.v || []).forEach(function (v) { if (v.id) BY_VAR[v.id] = p; });
    });
    evData();
    Object.keys(CFG.categoryImages || {}).forEach(function (n) { cover[fold(n)] = bySlug[CFG.categoryImages[n]]; });
    // Kapak görselleri artık senkronda hesaplanıp veride geliyor; eski veri ise burada hesapla
    if (!d.cats.some(function (c) { return c.img === undefined; })) { applyConfig(); return; }
    // Her ürün, kendi kategorileri ve onların üst kategorileri altında bir kez listelenir (tek geçiş)
    var byCat = {};
    d.items.forEach(function (p) {
      if (!p.img) return;
      var seen = {};
      p.c.forEach(function (id) {
        for (var c = CATS_BY_ID[id], n = 0; c && !seen[c.id] && n < 10; c = CATS_BY_ID[c.p], n++) {
          seen[c.id] = 1;
          (byCat[c.id] = byCat[c.id] || []).push(p);
        }
      });
    });
    d.cats.forEach(function (c) {
      var inCat = byCat[c.id] || [];
      var inStock = inCat.filter(function (p) { return p.st; });
      var pick = (cover[c.f] && cover[c.f].img ? cover[c.f] : null) ||
        inStock.filter(function (p) { return own.test(p.b || ''); })[0] || inStock[0] || inCat[0];
      c.img = pick ? pick.img : '';
    });
    applyConfig();
  }

  function fetchData(pri) {
    var init = { credentials: 'omit' };
    if (pri) init.priority = pri; // boşta önceden indirme düşük öncelikli: banner'ların önüne geçmez
    return fetch(JSON_URL, init).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function load(pri) {
    if (DATA) return Promise.resolve(DATA);
    // Düşük öncelikli önceden indirme sürerken müşteri beklemeye başladıysa (panel/menü açtı) yüksek öncelikli
    // ikinci bir indirme başlat; hangisi önce biterse o kullanılır
    if (loading && (!loading.low || pri === 'low')) return loading;
    // 280 KB'lık veriyi localStorage'a yazmak/okumak telefonu kilitliyordu; tarayıcının HTTP önbelleği yeterli
    try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem('ua-data-v4'); } catch (e) {}
    var prev = loading && loading.raw, mine = fetchData(pri);
    var raw = !prev ? mine : new Promise(function (res, rej) {
      var fails = 0, fail = function (e) { if (++fails === 2) rej(e); };
      prev.then(res, fail);
      mine.then(res, fail);
    });
    var pr = raw.then(function (d) {
      if (DATA) return DATA;
      // Müşteri beklemiyorsa (panel kapalı) hazırlığı tarayıcı boşa çıkınca yap; sayfa kaydırması takılmasın
      return new Promise(function (res) { if (isOpen || DM_NEED) return res(); PREP_NOW = res; idle(res, 1500); }).then(function () {
        PREP_NOW = null;
        if (!DATA) prepare(d);
        return DATA;
      });
    }).catch(function (e) { if (loading === pr) loading = null; throw e; });
    pr.raw = raw;
    pr.low = pri === 'low';
    loading = pr;
    return pr;
  }


  // ---------------- Arama ----------------
  function scoreToken(p, tok) {
    var alts = [tok].concat(SYN[tok] || []), best = 0, hit = null;
    for (var i = 0; i < alts.length; i++) {
      var a = alts[i], s = 0;
      if (p.nw.some(function (w) { return w.indexOf(a) === 0; })) s = 5;
      else if (p.w.some(function (w) { return w.indexOf(a) === 0; })) s = 3;
      else if (a.length >= 3 && p.hay.indexOf(a) !== -1) s = 2;
      else if (a.length >= 4 && p.w.some(function (w) { return lev(w.slice(0, a.length), a) <= 1 || lev(w, a) <= 1; })) s = 1;
      if (s > best) { best = s; hit = a; }
    }
    return [best, hit];
  }

  // Türkçe tamlamada asıl ürün sondaki isimdir: "Saksı Toprağı" bir topraktır, "saksı" onu niteler.
  // Kelime adda sadece böyle niteleyici olarak geçiyorsa (ve katalogda o kelimenin asıl ürün olduğu
  // yeterince ürün varsa) sonuç geriye düşer; kategorisinin adı o kelimeyle bitenler öne çıkar.
  var HEAD = /^(topra[gk]|gubre|tohum|fide|altli[gk]|tabag|harc|karisim|besin|ilac|aski)/;
  function nameRole(p, tok, tokens) {
    var w = p.nw, found = false;
    for (var i = 0; i < w.length; i++) {
      if (w[i].indexOf(tok) !== 0) continue;
      found = true;
      var nx = w[i + 1];
      var mod = nx && HEAD.test(nx) && !tokens.some(function (t) { return t !== tok && nx.indexOf(t) === 0; });
      if (!mod) return 'head';
    }
    return found ? 'mod' : '';
  }
  function catHead(p, tok) {
    return p.c.some(function (id) {
      var c = CATS_BY_ID[id], ws = c ? words(c.f) : [];
      return ws.length && ws[ws.length - 1].indexOf(tok) === 0;
    });
  }
  function search(q) {
    var qn = fold(q).trim();
    if (!qn || !DATA) return { items: [], cats: [], tokens: [] };
    var tokens = qn.split(/\s+/).filter(Boolean), res = [], heads = {};
    DATA.items.forEach(function (p) {
      var total = 0, hits = [], roles = [];
      for (var i = 0; i < tokens.length; i++) {
        var r = scoreToken(p, tokens[i]);
        if (!r[0]) return;
        total += r[0]; hits.push(r[1]);
        var role = tokens[i].length >= 3 ? nameRole(p, tokens[i], tokens) : '';
        roles.push(role);
        if (role === 'head') heads[tokens[i]] = (heads[tokens[i]] || 0) + 1;
        if (tokens[i].length >= 3 && catHead(p, tokens[i])) total += 3;
      }
      if (p.nf.indexOf(qn) === 0) total += 4;
      else if (p.nf.indexOf(qn) !== -1) total += 2;
      if (!p.st) total -= 4;
      total += p.r || 0;
      res.push({ p: p, s: total, h: hits, roles: roles });
    });
    res.forEach(function (x) {
      x.roles.forEach(function (role, i) { if (role === 'mod' && (heads[tokens[i]] || 0) >= 3) x.s -= 5; });
    });
    res.sort(function (a, b) { return b.s - a.s || a.p.n.length - b.p.n.length; });
    var cats = DATA.cats.filter(function (c) {
      return tokens.every(function (t) {
        return c.f.indexOf(t) !== -1 || (SYN[t] || []).some(function (a) { return c.f.indexOf(a) !== -1; });
      });
    }).sort(function (a, b) { return b.k - a.k; });
    return { items: res, cats: cats, tokens: tokens };
  }

  function highlight(text, nf, hits) {
    var mark = new Array(text.length);
    hits.filter(Boolean).forEach(function (h) {
      var i = -1;
      while ((i = nf.indexOf(h, i + 1)) !== -1) {
        if (i === 0 || /[^a-z0-9]/.test(nf[i - 1])) for (var k = i; k < i + h.length; k++) mark[k] = true;
      }
    });
    var out = '', open = false;
    for (var i = 0; i < text.length; i++) {
      if (mark[i] && !open) { out += '<mark>'; open = true; }
      if (!mark[i] && open) { out += '</mark>'; open = false; }
      out += esc(text[i]);
    }
    return out + (open ? '</mark>' : '');
  }

  // ---------------- Son aramalar ----------------
  function getRecent() {
    try { var a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function setRecent(a) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(a.slice(0, 6))); } catch (e) {} }
  function addRecent(q) {
    q = String(q || '').trim();
    if (q.length < 2) return;
    var f = fold(q);
    setRecent([q].concat(getRecent().filter(function (x) { return fold(x) !== f; })));
  }

  // ---------------- Arayüz ----------------
  function svg(d, w) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }
  var I = {
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 2.2),
    back: svg('<path d="M15 5l-7 7 7 7"/>', 2.4),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>', 2.2),
    clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    trend: svg('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
    right: svg('<path d="m9 6 6 6-6 6"/>', 2.4),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 2.2),
    sprout: svg('<path d="M12 21v-8"/><path d="M12 13c0-4 3-6 7-6 0 4-3 6-7 6zM12 11C12 8 10 6 5 6c0 3 2 5 7 5z"/>'),
    grid: svg('<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>'),
    calc: svg('<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7M8.5 11h1M12 11h1M8.5 14.5h1M12 14.5h1M8.5 18h1M12 18h1M15.5 11v7"/>'),
    doc: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'),
    book: svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5M8 7.5h8M8 11h5"/>'),
    shield: svg('<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-4.5"/>'),
    leaf: svg('<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19 13 11"/>'),
    star: svg('<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>'),
    drop: svg('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'),
    phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
    chat: svg('<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/><path d="M9 10.5c.5 2 2 3.5 4.5 4.5l1.2-1.2 1.8.8"/>'),
    minus: svg('<path d="M6 12h12"/>', 2.4),
    plus: svg('<path d="M12 6v12M6 12h12"/>', 2.4),
    cart: svg('<path d="M3 4h2l2.2 11h11l2-8H6.3"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>'),
    check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 2.6),
    truck: svg('<path d="M3 6h11v10H3zM14 9.5h4l3 3.5V16h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>'),
    tag: svg('<path d="M3 12V4h8l9.5 9.5-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>'),
    bag: svg('<path d="M6 7h12l1.5 13h-15z"/><path d="M9 7V5.5a3 3 0 0 1 6 0V7"/><path d="M7.5 13c2 1.3 7 1.3 9 0"/>')
  };

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}',
    'button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}',
    'a{color:inherit;text-decoration:none}',
    'svg{display:block}',
    '.root{--pr:#0b5d73;--prd:#07404f;--soft:#e8f3f6;--bg:#f3f6f7;--ln:#e3e8eb;--ink:#14212b;--mu:#66737c;--ac:#d7372f;--ok:#1f8a5b;--hov:#d6eaf0;--lt:#cfe3e9;--lt2:#b9d3db;--dash:#9cc7d3;',
    ' font-family:inherit;color:var(--ink);-webkit-font-smoothing:antialiased;font-size:15px;line-height:1.35}',

    /* Ürün Bul butonu */
    '.fab{position:fixed;z-index:2147482990;bottom:calc(var(--fb,20px) + var(--lift,0px) + env(safe-area-inset-bottom,0px));right:20px;display:flex;align-items:center;gap:10px;',
    ' height:52px;padding:0 20px 0 8px;border-radius:26px;background:var(--pr);color:#fff;font-weight:700;font-size:15px;',
    ' box-shadow:0 10px 28px rgba(7,50,64,.3);transition:padding .25s,gap .25s,transform .2s,opacity .25s,bottom .35s cubic-bezier(.2,.8,.2,1)}',
    /* Hareket: yayılan halka, parıltı, arada "etrafa bakan" büyüteç, girişte zıplama */
    '.fab::before{content:"";position:absolute;inset:-3px;border-radius:inherit;border:2px solid var(--pr);opacity:0;pointer-events:none;animation:fring 2.8s ease-out infinite}',
    '@keyframes fring{0%{transform:scale(1);opacity:.6}75%,100%{transform:scale(1.12,1.4);opacity:0}}',
    '.fab .gl{position:absolute;inset:0;border-radius:inherit;overflow:hidden;pointer-events:none}',
    // Parıltı sadece transform ile kayar (ekran kartında; sayfayı yeniden çizdirmez)
    '.fab .gl::after{content:"";position:absolute;top:0;bottom:0;left:0;width:35%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.38),transparent);transform:translateX(-130%) skewX(-18deg);animation:fshine 5.5s ease-in-out infinite 1.2s;will-change:transform}',
    '@keyframes fshine{0%,62%{transform:translateX(-130%) skewX(-18deg)}82%,100%{transform:translateX(345%) skewX(-18deg)}}',
    '.fab .fi svg{animation:flook 6.5s ease-in-out infinite 2s;transform-origin:45% 45%}',
    '@keyframes flook{0%,80%,100%{transform:none}84%{transform:rotate(-16deg) scale(1.12)}88%{transform:rotate(12deg) scale(1.12)}92%{transform:rotate(-6deg)}96%{transform:none}}',
    '.fab.in{animation:fpop .55s cubic-bezier(.3,1.5,.5,1)}',
    '@keyframes fpop{0%{transform:translateY(24px) scale(.8);opacity:0}100%{transform:none;opacity:1}}',
    '.fab.still::before,.fab.still .gl::after,.fab.still .fi svg{animation:none}',
    '@media(prefers-reduced-motion:reduce){.fab::before,.fab .gl::after,.fab .fi svg,.fab.in{animation:none!important}}',
    '.fab.blocked{opacity:0;pointer-events:none}',
    '.fab .fi{width:36px;height:36px;border-radius:50%;background:#fff;color:var(--pr);display:grid;place-items:center;flex:none}',
    '.fab .fi svg{width:19px;height:19px}',
    '.fab.left{right:auto;left:20px}',
    '.fab span.t{max-width:120px;overflow:hidden;white-space:nowrap;transition:max-width .25s,opacity .2s}',
    '.fab.mini{padding:0 8px;gap:0}.fab.mini span.t{max-width:0;opacity:0}',
    '.fab:hover{transform:translateY(-2px)}',
    '.fab.hide{opacity:0;pointer-events:none;transform:translateY(12px)}',
    '@media(max-width:759px){.fab{right:14px;height:50px}.fab.left{left:14px}}',

    /* Panel */
    '.ov{position:fixed;inset:0;z-index:2147483000;display:none;background:rgba(10,24,32,.5)}',
    // Arka plan bulanıklığı sadece geniş ekranda (telefonda panel tüm ekranı kaplar; görünmeyen bulanıklık işlemciyi yorar)
    '@media(min-width:760px){.ov{-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}}',
    '.ov.on{display:block}',
    '.panel{position:absolute;inset:0;background:#fff;display:flex;flex-direction:column;overflow:hidden;animation:up .22s cubic-bezier(.2,.8,.2,1)}',
    '@keyframes up{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}',
    '@media(min-width:760px){.panel{inset:5vh auto auto 50%;transform:translateX(-50%);width:min(1000px,calc(100vw - 32px));height:min(84vh,760px);',
    ' border-radius:24px;box-shadow:0 30px 90px rgba(5,25,35,.35);animation:none}}',

    '.top{flex:none;display:flex;align-items:center;gap:8px;padding:10px 12px}',
    '.cbtn{position:relative;width:42px;height:42px;display:grid;place-items:center;border-radius:50%;flex:none;background:var(--soft);color:var(--prd)}',
    '.cbtn svg{width:21px;height:21px}.cbtn:hover{background:var(--hov)}',
    '.cn{position:absolute;top:-3px;right:-3px;min-width:19px;height:19px;padding:0 5px;border-radius:10px;background:var(--ac);color:#fff;font-size:11px;font-weight:800;line-height:19px;text-align:center;box-shadow:0 0 0 2px #fff;display:none}',
    '.cn.on{display:block;animation:cnpop .35s cubic-bezier(.3,1.6,.5,1)}',
    '@keyframes cnpop{from{transform:scale(.3)}}',
    '.back,.xbtn{width:42px;height:42px;display:grid;place-items:center;border-radius:50%;flex:none}',
    '.back{background:var(--bg)}.back svg{width:22px;height:22px}',
    '.back{display:none;background:var(--bg)}.panel.sub .back{display:grid}.xbtn{display:grid;background:var(--ac);color:#fff;box-shadow:0 3px 10px rgba(215,55,47,.35)}.xbtn svg{width:22px;height:22px;stroke-width:2.8}.xbtn:hover{filter:brightness(.92)}.xbtn:active{transform:scale(.94)}',
    '.field{flex:1;display:flex;align-items:center;gap:10px;height:48px;padding:0 6px 0 16px;border-radius:24px;background:var(--bg);min-width:0;border:2px solid transparent;transition:border-color .15s,background .15s}',
    '.field:focus-within{border-color:var(--pr);background:#fff}',
    '.field>svg{width:20px;height:20px;color:var(--pr);flex:none}',
    '.field input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:16px;color:var(--ink);-webkit-appearance:none;appearance:none}',
    '.field input::placeholder{color:#8d989f}',
    '.field input::-webkit-search-cancel-button{display:none}',
    '.clr{width:32px;height:32px;border-radius:50%;display:none;place-items:center;color:var(--mu);background:#fff}',
    '.clr.on{display:grid}.clr svg{width:16px;height:16px}',
    '@media(min-width:760px){.xbtn{display:grid}.top{padding:16px 16px 12px 20px;border-bottom:1px solid var(--ln)}.field{height:52px}.field input{font-size:17px}}',

    '.mid{flex:1;display:flex;min-height:0}',
    '.main{flex:1;min-width:0;display:flex;flex-direction:column;position:relative}',

    /* Masaüstü sol menü */
    '.rail{display:none;flex:none;width:236px;flex-direction:column;gap:4px;padding:14px 12px;border-right:1px solid var(--ln)}',
    '@media(min-width:760px){.rail{display:flex}}',
    '.nav{display:flex;align-items:center;gap:12px;height:46px;padding:0 14px;border-radius:14px;font-size:14.5px;font-weight:600;color:#4b5963;text-align:left}',
    '.nav svg{width:20px;height:20px;flex:none}',
    '.nav:hover{background:var(--bg)}',
    '.nav.on{background:var(--soft);color:var(--pr)}',
    '.typing .nav.on{background:none;color:#4b5963}',
    '.help{margin-top:auto;padding:14px;border-radius:18px;background:var(--prd);color:#fff}',
    '.help b{display:block;font-size:14px}',
    '.help p{font-size:12.5px;color:var(--lt2);margin:2px 0 10px}',
    '.help a{display:flex;align-items:center;gap:7px;height:40px;padding:0 10px;border-radius:12px;font-size:13px;font-weight:700;margin-top:6px;white-space:nowrap}',
    '.help a svg{width:18px;height:18px;flex:none}',
    '.help .wa{background:#25a162}',
    '.help .tel{background:rgba(255,255,255,.12)}',

    /* Mobil alt çubuk */
    '.mfoot{flex:none;display:none;gap:8px;padding:8px 12px calc(8px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--ln);background:#fff}',
    '.mfoot.on{display:flex}',

    '.mfoot .tel .tl{display:none}@media(min-width:760px){.mfoot .tel .tl{display:inline}}',
    '@media(max-width:759px){.typing .mfoot{display:none!important}}',
    '.mfoot a{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;height:44px;border-radius:22px;font-weight:700;font-size:14px}',
    '.mfoot a svg{width:18px;height:18px}',
    '.mfoot .wa{background:#25a162;color:#fff}',
    '.mfoot .tel{background:var(--bg);color:var(--ink)}',

    '.tools{flex:none;display:none;gap:8px;padding:10px 16px;border-bottom:1px solid var(--ln);overflow-x:auto;scrollbar-width:none;white-space:nowrap}',
    '.tools::-webkit-scrollbar{display:none}',
    '.typing .tools.on{display:flex}',
    '.opt{height:34px;padding:0 14px;border-radius:17px;background:var(--bg);font-size:13.5px;font-weight:600;color:#44525c;flex:none;display:flex;align-items:center;gap:7px}',
    '.opt.on{background:var(--ink);color:#fff}',
    '.opt i{width:8px;height:8px;border-radius:50%;background:var(--ok);display:block}',

    '.body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding-bottom:16px}',
    '.idle{display:block}.results{display:none}.typing .idle{display:none}.typing .results{display:block}',
    '.pane{display:none}.pane.on{display:block}',
    '.h{display:flex;align-items:center;justify-content:space-between;padding:18px 16px 10px;font-size:16px;font-weight:800;color:var(--ink)}',
    '.h small{font-weight:600;font-size:13px;color:var(--mu)}',
    '.h button{font-size:13px;color:var(--pr);font-weight:700}',
    '@media(min-width:760px){.h{padding:20px 20px 10px}}',
    '.mo{display:block}@media(min-width:760px){.mo{display:none}}',

    '.recent{display:flex;gap:8px;padding:0 16px 4px;overflow-x:auto;scrollbar-width:none}',
    '.recent::-webkit-scrollbar{display:none}',
    '.rc{flex:none;display:flex;align-items:center;gap:6px;height:36px;padding:0 6px 0 12px;border-radius:18px;border:1px solid var(--ln);font-size:14px}',
    '.rc svg{width:15px;height:15px;color:#9aa5ac}',
    '.rc .del{width:26px;height:26px;border-radius:50%;display:grid;place-items:center}',
    '.rc .del svg{width:13px;height:13px}',

    '.trend{display:flex;gap:8px;padding:0 16px 4px;overflow-x:auto;scrollbar-width:none}',
    '.trend::-webkit-scrollbar{display:none}',
    '@media(min-width:760px){.trend,.recent{flex-wrap:wrap;padding:0 20px 4px}}',
    '.tq.rc{background:#fff;border:1px solid var(--ln);color:var(--ink);font-weight:500}.tq.rc svg{color:#9aa5ac}',
    '.tq{flex:none;display:flex;align-items:center;gap:6px;height:38px;padding:0 16px 0 12px;border-radius:19px;background:var(--soft);color:var(--prd);font-size:14px;font-weight:600}',
    '.tq svg{width:15px;height:15px}',
    '.tq:hover{background:var(--hov)}',
    '.center{justify-content:center;flex-wrap:wrap}',

    /* Hesaplayıcı banner */
    '.feat{display:grid;grid-template-columns:1fr;gap:14px;padding:0 16px 4px}',
    '@media(min-width:760px){.feat{grid-template-columns:1fr 1fr;gap:16px;padding:0 20px 4px}}',
    '.ft{display:block;min-width:0;width:100%;text-align:left}',
    '.ft .fi{display:block;border-radius:18px;overflow:hidden;background:var(--bg);box-shadow:0 1px 0 var(--ln)}',
    /* Görsel kırpılmadan, kendi oranıyla */
    '.ft .fi{aspect-ratio:2/1}',
    '.ft .fi img{width:100%;height:100%;object-fit:contain;display:block;transition:transform .35s}',
    '.ft:hover .fi img{transform:scale(1.05)}',
    '.ft .fn{display:flex;align-items:baseline;justify-content:space-between;gap:6px;padding:8px 2px 0}',
    '.ft .fn b{font-size:14px;font-weight:700;line-height:1.25;min-width:0}',
    '.ft .fn small{flex:none;font-size:12px;color:var(--mu)}',
    '.promo{margin:12px 16px 0;border-radius:18px;overflow:hidden;background:linear-gradient(135deg,var(--prd),var(--pr));color:#fff}',
    '@media(min-width:760px){.promo{margin:18px 20px 0}}',
    '.pm1{display:flex;align-items:center;gap:12px;padding:14px}',
    '.pbadge{width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.15);display:grid;place-items:center;flex:none}',
    '.pbadge svg{width:22px;height:22px}',
    '.pm1 .tx{flex:1;min-width:0}.pm1 b{display:block;font-size:15px}.pm1 .tx span{display:block;font-size:12.5px;color:var(--lt);margin-top:1px}',
    '.pcode{flex:none;display:flex;flex-direction:column;align-items:center;padding:6px 12px;border-radius:12px;background:#fff;color:var(--prd);border:2px dashed var(--dash)}',
    '.pcode b{font-size:14px;font-weight:800;letter-spacing:.04em}.pcode em{font-style:normal;font-size:11px;font-weight:700;color:var(--mu)}',
    '.pm2{display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(0,0,0,.18);font-size:13px;font-weight:600}',
    '.pm2 svg{width:18px;height:18px;flex:none}',
    '.pmship b{color:#ffe08a}',
    '.xsell{flex:none;display:none;margin:0 10px 8px;padding:10px 12px 12px;border-radius:18px;background:#fff;border:1px solid var(--ln);box-shadow:0 -6px 24px rgba(7,64,79,.12)}',
    '.xsell.on{display:block;animation:xsin .3s ease-out}',
    '@keyframes xsin{from{opacity:0;transform:translateY(14px)}}',
    '@media(min-width:760px){.xsell{margin:0 20px 10px}}',
    '.xs-ok{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:700;color:var(--ink)}',
    '.xs-ok>svg{width:18px;height:18px;color:#1f8a4c;flex:none}.xs-ok span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.xs-ok a{font-size:12.5px;font-weight:700;color:var(--pr);white-space:nowrap}',
    '.xs-ok button{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;color:var(--mu);flex:none}.xs-ok button svg{width:15px;height:15px}',
    '.xs-h{font-size:12px;font-weight:700;color:var(--mu);margin:8px 0 6px;letter-spacing:.02em}',
    '.xs-l{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.xs-i{display:flex;align-items:center;gap:8px;min-width:0;padding:6px;border-radius:12px;background:var(--bg)}',
    '.xs-i .im{position:relative;width:52px;height:52px;border-radius:10px;flex:none;background:#fff;overflow:hidden;display:grid;place-items:center}',
    '.xs-i .im img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;padding:3px;background:#fff}.xs-i .im>svg{width:20px;height:20px;color:var(--mu)}',
    '.xs-i .tx{flex:1;min-width:0}.xs-i .tx a{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12px;font-weight:600;line-height:1.25;color:var(--ink)}',
    '.xs-i .tx b{display:block;font-size:12.5px;margin-top:2px;color:var(--prd)}',
    '.xs-i .add{flex:none;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:var(--pr);color:#fff;padding:0}.xs-i .add svg{width:17px;height:17px}',
    '.xs-i .add span{display:none}',
    '.soil{margin:12px 16px 0;padding:12px;border-radius:18px;background:#f1f8ec;border:1px solid #d9ead0}',
    '@media(min-width:760px){.soil{margin:14px 20px 0}}',
    '.so-h{display:flex;gap:10px;align-items:flex-start}.so-h>svg{width:22px;height:22px;flex:none;color:#3f7d4f;margin-top:1px}',
    '.so-h b{display:block;font-size:15px;color:#2d5a38}.so-h span{display:block;font-size:12.5px;color:#4b5f52;margin-top:2px;line-height:1.4}',
    '.so-l{display:grid;gap:6px;margin-top:10px}@media(min-width:760px){.so-l{grid-template-columns:1fr 1fr}}',
    '.so-or{font-size:12px;color:#4b5f52;margin:10px 2px 6px}.so-h span a{color:#2d5a38;font-weight:700;text-decoration:underline}',
    '.soil .xs-i{background:#fff}.xs-i .tx b em{font-style:normal;font-weight:600;font-size:11.5px;color:#3f7d4f}',
    '.shipbar{flex:none;display:none;padding:8px 14px 10px;border-top:1px solid var(--ln);background:#fff}',
    '.shipbar.on{display:block;animation:sbin .35s ease-out}',
    '@keyframes sbin{from{opacity:0;transform:translateY(8px)}}',
    '.sbt{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink);line-height:1.3}',
    '.sbi{width:26px;height:26px;border-radius:50%;background:var(--soft);color:var(--pr);display:grid;place-items:center;flex:none}.sbi svg{width:16px;height:16px}',
    '.sbx{flex:1;min-width:0}.sbx b{color:var(--prd)}.sbx small{float:right;color:var(--mu);font-size:12px;margin-left:8px}',
    '.sbr{height:8px;border-radius:4px;background:var(--bg);overflow:hidden;margin-top:7px}',
    '.sbr i{display:block;height:100%;width:0;border-radius:4px;transition:width .8s cubic-bezier(.2,.8,.2,1);',
    'background:linear-gradient(90deg,var(--pr),#2aa3b8);background-size:200% 100%;animation:sbmove 1.6s linear infinite}',
    '@keyframes sbmove{from{background-position:200% 0}to{background-position:0 0}}',
    '.shipbar.ok .sbi{background:#e5f6ec;color:#1f8a4c}.shipbar.ok .sbx b{color:#1f8a4c}.shipbar.ok .sbr i{background:#2fa35f}',
    '@media(min-width:760px){.shipbar{padding:10px 20px 12px}}',
    '.sh-ship{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:12px;font-size:12.5px;font-weight:600;color:var(--mu)}',
    '.sh-ship svg{width:16px;height:16px;color:var(--ok)}',
    '.banner{display:flex;align-items:center;gap:14px;margin:16px 16px 0;padding:16px;border-radius:20px;background:linear-gradient(135deg,var(--prd),var(--pr));color:#fff;text-align:left;width:calc(100% - 32px)}',
    '@media(min-width:760px){.banner{margin:20px 20px 0;width:calc(100% - 40px)}}',
    '.banner .bi{width:48px;height:48px;border-radius:14px;background:rgba(255,255,255,.14);display:grid;place-items:center;flex:none}',
    '.banner .bi svg{width:26px;height:26px}',
    '.banner div.tx{flex:1;min-width:0}',
    '.banner b{display:block;font-size:16px}',
    '.banner span{display:block;font-size:13px;color:var(--lt);margin-top:2px}',
    '.banner>svg{width:22px;height:22px;flex:none}',

    /* Kategoriler */
    '.tabs{flex:none;display:flex;border-bottom:1px solid var(--ln);background:#fff}',
    '.tb .tl{display:none}',

    '.tb{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;height:46px;font-size:13.5px;font-weight:700;color:var(--mu);border-bottom:2.5px solid transparent;margin-bottom:-1px;white-space:nowrap}',
    '.tb svg{display:none}',
    '@media(max-width:379px){.tb{font-size:12.5px}}',

    /* Kullanım rehberi */
    '.gd{padding:16px 16px 8px}',
    '@media(min-width:760px){.gd{padding:20px}}',
    '.gd-h b{display:block;font-size:22px;font-weight:800}',
    '.gd-h p{font-size:14px;color:var(--mu);margin-top:4px}',
    '.field.gq{margin-top:14px;height:50px;background:#fff;border-color:var(--pr)}',
    '.field.gq>svg{color:var(--ok)}',
    '.gres .gcard{margin:12px 0 0}',
    '.gsw{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:14px 0 4px}',
    '.gsw::-webkit-scrollbar{display:none}',
    '.gsw button{flex:none;height:38px;padding:0 16px;border-radius:19px;border:1.5px solid var(--ln);font-size:14px;font-weight:700}',
    '.gsw button.on{background:var(--pr);border-color:var(--pr);color:#fff}',
    '.gcat{margin:18px 0 8px;font-size:12.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mu)}',
    '.gg{border:1px solid var(--ln);border-radius:16px;margin-bottom:8px;overflow:hidden}',
    '.gg summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:12px 14px}',
    '.gg summary::-webkit-details-marker{display:none}',
    '.gg summary div{flex:1;min-width:0}',
    '.gg summary b{display:block;font-size:15px}',
    '.gg summary small{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12.5px;color:var(--mu);margin-top:2px}',
    '.gg summary>svg{width:18px;height:18px;color:var(--mu);flex:none;transition:transform .2s}',
    '.gg[open] summary>svg{transform:rotate(90deg)}',
    '.gg[open] summary{border-bottom:1px solid var(--ln)}',
    '.gg .pl{padding:10px 14px 0;font-size:12.5px;color:var(--mu)}',
    '.steps{padding:8px 14px 12px}',
    '.sr{display:grid;grid-template-columns:1fr auto;gap:2px 12px;padding:9px 0;align-items:center}',
    '.sr+.sr{border-top:1px dashed var(--ln)}',
    '.sr b{font-size:14px}',
    '.sr span{grid-column:1;font-size:12.5px;color:var(--mu)}',
    '.sr em{grid-row:1/span 2;grid-column:2;font-style:normal;text-align:right;font-size:14.5px;font-weight:800;color:var(--prd);background:var(--soft);padding:6px 10px;border-radius:10px;white-space:nowrap}',
    '.sr em small{display:block;font-size:11px;font-weight:600;color:var(--mu)}',
    '.glink{display:flex;align-items:center;gap:8px;margin:4px 14px 12px;font-size:13.5px;font-weight:700;color:var(--pr)}',
    '.glink svg{width:16px;height:16px}',
    '.gprod{display:flex;align-items:center;gap:12px;margin-top:16px;padding:10px;border-radius:16px;background:var(--bg)}',
    '.gprod .im{width:56px;height:56px;background:#fff}.gprod .im img{object-fit:contain}',
    '.gprod div.tx{flex:1;min-width:0}.gprod b{display:block;font-size:14px}.gprod small{font-size:12.5px;color:var(--mu)}',
    '.gprod>svg{width:18px;height:18px;color:var(--pr)}',
    '.gnote{margin-top:14px;padding:12px 14px;border-radius:14px;background:#fff6e5;color:#6b4a00;font-size:12.5px;line-height:1.45}',
    '.gcard{margin:12px 16px 0;border:1.5px solid var(--pr);border-radius:18px;overflow:hidden}',
    '@media(min-width:760px){.gcard{margin:14px 20px 0}}',
    '.gcard .gc-h{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--soft)}',
    '.gcard .gc-h>svg{width:22px;height:22px;color:var(--pr);flex:none}',
    '.gcard .gc-h b{display:block;font-size:15px;color:var(--prd)}.gcard .gc-h small{font-size:12.5px;color:var(--mu)}',
    '.gcard .gc-f{display:flex;gap:8px;padding:0 14px 12px}',
    '.gcard .gc-f a{flex:1;display:flex;align-items:center;justify-content:center;height:38px;border-radius:12px;font-size:13px;font-weight:700;background:var(--bg)}',
    '.gcard .gc-f a.pri{background:var(--pr);color:#fff}',
    '.tb.on{color:var(--pr);border-bottom-color:var(--pr)}',
    '.hw{display:block}.cside{display:none}',
    '@media(min-width:760px){.hw{display:grid;grid-template-columns:250px minmax(0,1fr);align-items:start}',
    ' .cside{display:block;position:sticky;top:0;max-height:calc(min(84vh,760px) - 170px);overflow-y:auto;padding:0 8px 16px 12px;border-right:1px solid var(--ln);scrollbar-width:thin}',
    ' .hw .catsec{display:none}.hm{min-width:0}}',
    '.cside .h{padding:18px 8px 8px}',
    '.tr{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:8px 10px;border-radius:12px;text-align:left;font-size:14px;font-weight:600;color:#33414b}',
    '.tr:hover{background:var(--bg)}',
    '.tr>svg{width:16px;height:16px;flex:none;color:var(--mu);transition:transform .2s}',
    '.tr>i{width:16px;flex:none}',
    '.tr.op>svg{transform:rotate(90deg)}',
    '.tr span{flex:1;min-width:0;line-height:1.3}',
    '.tr small{flex:none;font-size:12px;font-weight:600;color:var(--mu);background:var(--bg);border-radius:10px;padding:1px 8px}',
    '.tr.on{background:var(--soft);color:var(--prd)}.tr.on small{background:#fff}',
    '.tr.d1{padding-left:34px;font-weight:500;min-height:36px;font-size:13.5px}',
    '.tr.d2{padding-left:48px;font-weight:500;min-height:34px;font-size:13px}',
    '.catsec{margin:12px 16px 0;border-radius:18px;background:var(--soft);overflow:hidden}',
    '.cx{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;text-align:left}',
    '.cxi{width:42px;height:42px;border-radius:13px;background:var(--pr);color:#fff;display:grid;place-items:center;flex:none}',
    '.cxi svg{width:20px;height:20px}',
    '.cxt{flex:1;min-width:0}.cxt b{display:block;font-size:15.5px;font-weight:800;color:var(--prd)}',
    '.cxt small{display:block;font-size:12.5px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}',
    '.cxa{width:32px;height:32px;border-radius:50%;background:#fff;display:grid;place-items:center;color:var(--pr);flex:none}',
    '.cxa svg{width:16px;height:16px;transform:rotate(90deg);transition:transform .2s}',
    '.catsec.open .cxa svg{transform:rotate(-90deg)}',
    '.catsec .clist{background:#fff;margin:0 6px 6px;border-radius:14px;padding:0 6px}',
    '.clist{padding:0 8px}',
    '@media(min-width:760px){.clist{display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;padding:0 12px}}',
    '.li{display:flex;align-items:center;gap:12px;width:100%;padding:8px;border-radius:16px;text-align:left}',
    '.li:hover{background:var(--bg)}',
    '.li .im{width:56px;height:56px;border-radius:14px;background:#fff;border:1px solid var(--ln)}',
    '.li .im img{object-fit:contain;padding:4px}',
    '@media(max-width:759px){.clist .li,.list .li{border-radius:0;padding:10px 8px}.clist .li+.li,.list .li+.li{border-top:1px solid var(--ln)}}',
    '.li .n{flex:1;min-width:0;font-size:15px;font-weight:600}',
    '.li .n small{display:block;color:var(--mu);font-size:13px;font-weight:500;margin-top:1px}',
    '.li>svg{width:18px;height:18px;color:#a7b1b7;flex:none}',
    '.li .ico{width:44px;height:44px;border-radius:14px;background:var(--soft);display:grid;place-items:center;color:var(--pr);flex:none}',
    '.li .ico svg{width:20px;height:20px}',
    '.list{padding:0 8px}',
    '@media(min-width:760px){.list{padding:0 12px}}',

    '.crumb{display:flex;align-items:center;gap:8px;padding:12px 10px 0}',
    '.crumb button{display:flex;align-items:center;gap:4px;height:36px;padding:0 12px 0 6px;border-radius:18px;font-size:14px;font-weight:600;color:var(--mu)}',
    '.crumb button:hover{background:var(--bg)}',
    '.crumb svg{width:18px;height:18px}',
    '.ctitle{display:flex;align-items:baseline;justify-content:space-between;gap:2px 10px;padding:16px 16px 12px;font-size:22px;font-weight:800}',
    '.ctitle small{font-size:13px;font-weight:600;color:var(--mu)}',
    '.ctitle{flex-wrap:wrap}.ctitle span{flex:1;min-width:0}.ctitle em{flex-basis:100%;font-style:normal;font-size:12.5px;font-weight:700;color:var(--mu);letter-spacing:.02em}',
    '.cban{margin:8px 16px 4px;border-radius:18px;overflow:hidden;background:var(--bg)}',
    '@media(min-width:760px){.cban{margin:8px 20px 4px}}',
    '.cban img{width:100%;height:auto;display:block}',
    '.ctools{display:flex;gap:8px;padding:12px 16px 12px;overflow-x:auto;scrollbar-width:none;white-space:nowrap}',
    '.ctools::-webkit-scrollbar{display:none}',
    '@media(min-width:760px){.ctools{padding:12px 20px}}',
    '@media(min-width:760px){.ctitle{padding:18px 20px 12px}}',
    '.all-in{display:flex;align-items:center;justify-content:space-between;margin:0 16px 10px;padding:14px 16px;border-radius:16px;background:var(--pr);color:#fff;font-weight:700;font-size:14.5px}',
    '.all-in{width:calc(100% - 32px);text-align:left}',
    '@media(min-width:760px){.all-in{margin:0 20px 10px;width:calc(100% - 40px)}}',
    '.all-in svg{width:18px;height:18px}',

    '.im{flex:none;border-radius:12px;background:var(--bg);overflow:hidden;display:grid;place-items:center;color:#a9c3cc;position:relative}',
    '.im img{width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .25s}',
    '.im img.ok{opacity:1}',
    // Görsel inene kadar sade yer tutucu (animasyonsuz: kaydırırken telefonu yormaz)
    '.im:has(img:not(.ok)){background:#eef2f3 !important}',
    '.im>svg{width:42%;height:42%}',

    /* Sonuçlar */
    '.cats{display:flex;gap:8px;padding:12px 16px 0;overflow-x:auto;scrollbar-width:none}',
    '@media(min-width:760px){.cats{padding:14px 20px 0}}',
    '.cats::-webkit-scrollbar{display:none}',
    '.cc{flex:none;display:flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:17px;border:1.5px solid var(--ln);font-size:13.5px;font-weight:600;white-space:nowrap}',
    '.cc small{color:var(--mu);font-weight:500}',
    '.cc:hover{border-color:var(--pr);color:var(--pr)}',
    '.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 12px}',
    '@media(min-width:760px){.grid{grid-template-columns:repeat(3,1fr);gap:14px;padding:0 20px}}',
    '@media(min-width:960px){.grid{grid-template-columns:repeat(4,1fr)}}',
    '.card{display:flex;flex-direction:column;border-radius:18px;border:1px solid var(--ln);overflow:hidden;background:#fff;transition:box-shadow .15s,border-color .15s;min-width:0}',
    '.card:hover,.card.sel{border-color:#c8d5da;box-shadow:0 8px 22px rgba(10,40,55,.08)}',
    '.card>a.ph{position:relative;display:block;aspect-ratio:1/1;background:#fff}',
    '.card>a.ph .im{position:absolute;inset:0;border-radius:0;background:#fff;width:auto;height:auto}',
    '.card>a.ph img{object-fit:contain;padding:8px}',
    '.off{position:absolute;left:8px;top:8px;background:var(--ac);color:#fff;font-size:11.5px;font-weight:800;padding:3px 8px;border-radius:8px}',
    '.oosb{position:absolute;left:8px;bottom:8px;background:rgba(20,33,43,.78);color:#fff;font-size:11.5px;font-weight:700;padding:3px 8px;border-radius:8px}',
    '.cb{flex:1;display:flex;flex-direction:column;gap:6px;padding:10px 12px 12px}',
    '.pname{font-size:14px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.6em}',
    'mark{background:none;color:var(--pr);font-weight:800}',
    '.vchip{align-self:flex-start;font-size:11.5px;font-weight:700;color:var(--prd);background:var(--soft);padding:3px 8px;border-radius:7px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.badges{display:flex;flex-wrap:wrap;gap:4px}',
    '.hot{display:flex;gap:10px;overflow-x:auto;padding:0 16px 6px;scrollbar-width:none;scroll-snap-type:x proximity}',
    '.hot::-webkit-scrollbar{display:none}',
    '@media(min-width:760px){.hot{padding:0 20px 6px}}',
    '.hp{flex:0 0 138px;scroll-snap-align:start;display:flex;flex-direction:column;border:1px solid var(--ln);border-radius:16px;padding:8px;background:#fff}',
    '.hp:hover{border-color:var(--pr)}',
    '.hp .im{width:100%;height:112px;background:#fff}.hp .im img{object-fit:contain}',
    '.hp .hb{align-self:flex-start;margin-top:7px;font-size:11px;font-weight:700;padding:2px 7px;border-radius:8px;background:#fff3d6;color:#8a5a00}',
    '.hp b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:6px;font-size:13px;font-weight:600;line-height:1.3;min-height:34px}',
    '.hp small{margin-top:4px;font-size:14px;font-weight:800;color:var(--prd)}',
    '.badge.best,.badge.own{display:inline-flex;align-items:center;gap:3px}.badge svg{width:11px;height:11px}',
    '.badge.best{background:#fff3d6;color:#8a5a00}.badge.own{background:var(--soft);color:var(--prd)}',
    '.trust{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 16px 0}',
    '@media(min-width:760px){.trust{margin:12px 20px 0}}',
    '.tru{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px;border-radius:14px;border:1px solid var(--ln);text-align:center}',
    '.tru>svg{width:22px;height:22px;color:var(--pr)}',
    '.tru b{display:block;font-size:12.5px;line-height:1.25;color:var(--ink)}.tru small{display:block;font-size:11px;color:var(--mu);margin-top:2px;line-height:1.3}',
    '@media(min-width:760px){.tru{flex-direction:row;text-align:left;padding:10px 12px}.tru b{font-size:13px}}',
    '.badge{align-self:flex-start;background:#fdecea;color:var(--ac);font-weight:700;font-size:11px;padding:2px 7px;border-radius:6px}',
    '.pr{margin-top:auto;display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}',
    '.pr b{font-size:16px;font-weight:800}',
    '.pr b.dsc{color:var(--ac)}',
    '.pr s{font-size:12px;color:#99a4ab}',
    '.pr small{width:100%;font-size:11px;color:var(--mu);margin-top:-4px}',
    '.acts{display:flex;gap:6px}',
    '.acts a,.acts button{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;height:38px;border-radius:12px;font-size:13px;font-weight:700;white-space:nowrap}',
    '.acts .see{background:var(--bg);color:var(--ink)}',
    '.acts .add{background:var(--pr);color:#fff}',
    '.acts .add svg{width:17px;height:17px}',
    '.acts .add[disabled]{background:#d5dde1;color:#7b878e;cursor:default}',
    '.acts .add.ok{background:var(--ok)}',
    '@media(max-width:380px){.acts .see{flex:0 0 auto;padding:0 10px}.acts .add span{display:none}}',
    '.more{display:block;margin:16px auto 4px;height:42px;padding:0 22px;border-radius:21px;background:var(--bg);font-size:14px;font-weight:700}',
    '.more:hover{background:var(--ln)}',

    '.cta{flex:none;display:none;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--ln);background:#fff}',
    '.typing .cta.on{display:block}',
    '.cta a{display:flex;align-items:center;justify-content:center;gap:8px;height:46px;border-radius:23px;background:var(--ink);color:#fff;font-weight:700;font-size:14.5px}',
    '.cta a span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.cta svg{width:18px;height:18px;flex:none}',

    '.empty{padding:40px 24px 12px;text-align:center}',
    '.empty .ic{width:60px;height:60px;border-radius:50%;background:var(--soft);display:grid;place-items:center;margin:0 auto 14px;color:var(--pr)}',
    '.empty .ic svg{width:26px;height:26px}',
    '.empty b{display:block;font-size:17px;margin-bottom:6px}',
    '.empty p{color:var(--mu);font-size:14.5px}',
    '.empty p a{color:var(--pr);font-weight:700}',
    '.spin{width:28px;height:28px;border:3px solid var(--ln);border-top-color:var(--pr);border-radius:50%;margin:48px auto;animation:sp .8s linear infinite}',
    '@keyframes sp{to{transform:rotate(360deg)}}',

    /* Varyant seçimi (alttan açılan) */
    '.sheet{position:absolute;inset:0;z-index:5;display:none;background:rgba(10,24,32,.35)}',
    '.sheet.on{display:flex;align-items:flex-end}',
    '.sh-in{width:100%;max-height:80%;overflow-y:auto;background:#fff;border-radius:22px 22px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));animation:up .2s ease-out}',
    '@media(min-width:760px){.sheet.on{align-items:center;justify-content:center}.sh-in{width:440px;border-radius:22px}}',
    '.sh-h{display:flex;gap:12px;align-items:center}',
    '.sh-h .im{width:64px;height:64px;background:#fff;border:1px solid var(--ln)}',
    '.sh-h .im img{object-fit:contain}',
    '.sh-h b{flex:1;font-size:15px;line-height:1.3}',
    '.sh-h button{width:36px;height:36px;border-radius:50%;background:var(--bg);display:grid;place-items:center;flex:none}',
    '.sh-h button svg{width:16px;height:16px}',
    '.sh-l{font-size:13px;font-weight:700;color:var(--mu);margin:16px 0 8px}',
    '.vopts{display:flex;flex-wrap:wrap;gap:8px}',
    '.vo{display:flex;flex-direction:column;align-items:flex-start;padding:8px 12px;border-radius:12px;border:1.5px solid var(--ln);font-size:13.5px;font-weight:700;text-align:left}',
    '.vo small{font-size:12px;font-weight:600;color:var(--mu)}',
    '.vo.on{border-color:var(--pr);background:var(--soft);color:var(--prd)}',
    '.vo[disabled]{opacity:.45;cursor:default;text-decoration:line-through}',
    '.sh-f{display:flex;gap:10px;align-items:center;margin-top:18px}',
    '.qty{display:flex;align-items:center;gap:4px;height:46px;border-radius:23px;background:var(--bg);padding:0 4px;flex:none}',
    '.qty button{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.1)}',
    '.qty button svg{width:15px;height:15px}',
    '.qty input{width:36px;text-align:center;border:0;outline:0;background:transparent;font:inherit;font-size:16px;font-weight:700;color:var(--ink)}',
    '.sh-go{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;height:46px;border-radius:23px;background:var(--pr);color:#fff;font-weight:800;font-size:15px}',
    '.sh-go svg{width:18px;height:18px}',
    '.toast{position:absolute;left:50%;bottom:84px;transform:translateX(-50%);z-index:6;display:none;align-items:center;gap:8px;padding:10px 16px;border-radius:22px;background:var(--ink);color:#fff;font-size:14px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,.25);white-space:nowrap}',
    '.ptoast{position:fixed;left:50%;bottom:calc(90px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147483001;display:none;align-items:center;gap:10px;max-width:calc(100vw - 32px);padding:12px 18px;border-radius:16px;background:var(--ink);color:#fff;font-size:14px;font-weight:600;line-height:1.35;box-shadow:0 10px 30px rgba(0,0,0,.3)}',
    '.ptoast span{min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
    '.ptoast span{flex:1}.ptoast{width:min(440px,calc(100vw - 32px))}',
    '.root.sbon .ptoast{bottom:calc(150px + env(safe-area-inset-bottom,0px))}',
    '.ptoast a{flex:none;margin-left:4px;padding:6px 12px;border-radius:10px;background:#fff;color:var(--ink);font-size:13px;font-weight:700;white-space:nowrap}',
    '.bspin{width:15px;height:15px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:sp .7s linear infinite;flex:none}',
    '.ptoast.on{display:flex}.ptoast svg{width:20px;height:20px;flex:none;color:#7ee2a8}.ptoast.warn svg{color:#ffd27a}',
    '.toast.on{display:flex}.toast svg{width:18px;height:18px;color:#7ee2a8}',

    /* Toprak hesaplayıcı */
    '.calc{padding:16px 16px 8px;max-width:680px}',
    '@media(min-width:760px){.calc{padding:20px}}',
    '.c-head b{display:block;font-size:22px;font-weight:800}',
    '.c-head p{font-size:14px;color:var(--mu);margin-top:4px}',
    '.step{position:relative;margin-top:20px;padding-left:42px}',
    '.step:before{content:"";position:absolute;left:14px;top:32px;bottom:-16px;width:2px;background:var(--ln)}',
    '.step:last-child:before{display:none}',
    '.sn{position:absolute;left:0;top:0;width:30px;height:30px;border-radius:50%;background:var(--bg);color:var(--mu);font-size:13px;font-weight:800;display:grid;place-items:center}',
    '.step.done .sn{background:var(--pr);color:#fff}',
    '.st-t{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:30px;font-size:15.5px;font-weight:800;margin-bottom:10px}',
    '.chips{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '@media(min-width:760px){.chips{grid-template-columns:repeat(4,1fr)}}',
    '.sh{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 8px;border-radius:16px;border:1.5px solid var(--ln);font-size:13px;font-weight:700;text-align:center}',
    '.sh svg{width:28px;height:28px;color:var(--mu)}',
    '.sh:hover{border-color:#c4d2d8}',
    '.sh.on{border-color:var(--pr);background:var(--soft);color:var(--prd)}.sh.on svg{color:var(--pr)}',
    '.unit{display:flex;padding:3px;border-radius:18px;background:var(--bg)}',
    '.unit button{height:30px;padding:0 14px;border-radius:15px;font-size:13px;font-weight:700;color:var(--mu)}',
    '.unit button.on{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.12)}',
    '.dims{display:grid;gap:12px;padding:14px;border-radius:18px;background:var(--bg)}',
    '@media(min-width:560px){.dims{grid-template-columns:230px 1fr;align-items:center}}',
    '.fig{background:#fff;border-radius:14px;padding:6px}',
    '.fig svg{width:100%;height:auto;max-height:190px}',
    '@media(max-width:559px){.fig svg{max-height:150px}}',
    '.fig .body-f{fill:#e6f0f3;stroke:#37515e;stroke-width:1.8;stroke-linejoin:round}',
    '.fig .edge{fill:none;stroke:#37515e;stroke-width:1.8}',
    '.fig .soil{fill:#6b4a36}',
    '.fig .dl{stroke:#9aaab2;stroke-width:1.3}',
    '.fig .pl rect{fill:#fff;stroke:#cfdbe0}',
    '.fig .pl text{fill:#44525c;font-size:13px;font-weight:700;text-anchor:middle}',
    '.fig .pl.v rect{fill:var(--ink);stroke:var(--ink)}.fig .pl.v text{fill:#fff}',
    '.fig .pl.on rect{fill:var(--pr);stroke:var(--pr)}.fig .pl.on text{fill:#fff}',
    '.fig .dm.on .dl{stroke:var(--pr);stroke-width:2}',
    '.inputs{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '.inp label{display:block;font-size:12.5px;font-weight:700;color:var(--mu);margin-bottom:5px}',
    '.inp div.b{display:flex;align-items:center;height:46px;border-radius:14px;background:#fff;padding:0 12px;border:2px solid transparent}',
    '.inp div.b:focus-within{border-color:var(--pr)}',
    '.inp input{flex:1;min-width:0;width:100%;border:0;outline:0;background:transparent;font:inherit;font-size:16px;font-weight:700;color:var(--ink)}',
    '.inp em{font-style:normal;font-size:13px;color:var(--mu);font-weight:700}',
    '.inp .qty{background:#fff;width:100%;justify-content:space-between}',
    '.inp .qty button{background:var(--bg);box-shadow:none}',
    '.tip{grid-column:1/-1;font-size:12.5px;color:var(--mu)}',
    '.wait{padding:14px;border-radius:14px;border:1.5px dashed var(--ln);color:var(--mu);font-size:14px}',
    '.res{display:flex;align-items:center;gap:14px;padding:18px;border-radius:20px;background:linear-gradient(135deg,var(--prd),var(--pr));color:#fff}',
    '.res .ic{width:52px;height:52px;border-radius:16px;background:rgba(255,255,255,.14);display:grid;place-items:center;flex:none}',
    '.res .ic svg{width:28px;height:28px}',
    '.res b{display:block;font-size:30px;font-weight:800;letter-spacing:-.01em;line-height:1.1}',
    '.res span{display:block;font-size:13px;color:var(--lt);margin-top:3px}',
    '.note{display:flex;gap:8px;align-items:flex-start;margin-top:10px;padding:10px 12px;border-radius:12px;background:var(--bg);font-size:13px;color:#44525c;line-height:1.45}.note>svg{width:17px;height:17px;flex:none;color:var(--pr);margin-top:1px}',
    '.fx{margin-top:10px;padding:12px 14px;border-radius:14px;background:var(--bg);font-size:13.5px;line-height:1.55;font-variant-numeric:tabular-nums;word-break:break-word}',
    '.fx b{display:block;font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--mu);margin-bottom:2px}',
    '.fx small{display:block;font-size:12px;color:var(--mu);margin-top:2px}',
    '.rec{display:flex;gap:10px;align-items:flex-start;margin-top:10px;padding:12px 14px;border-radius:14px;border:1.5px solid var(--pr)}',
    '.rec>svg{width:20px;height:20px;color:var(--pr);flex:none;margin-top:1px}',
    '.rec b{display:block;font-size:15px;color:var(--prd)}.rec span{display:block;font-size:12.5px;color:var(--mu);margin-top:2px}',
    '.big{margin-top:10px;padding:10px 12px;border-radius:12px;background:#fff6e5;color:#7a4b00;font-size:13px}',
    '.big a{font-weight:700;text-decoration:underline}',
    '.go{margin-top:16px;font-size:14px;font-weight:700}',
    '.go small{display:block;font-weight:500;color:var(--mu);font-size:13px;margin-top:2px}',
    '.gocats{display:grid;gap:8px;margin-top:10px}',
    '@media(min-width:560px){.gocats{grid-template-columns:1fr 1fr}}',
    '.gc{display:flex;align-items:center;gap:10px;padding:8px 12px 8px 8px;border-radius:16px;border:1.5px solid var(--ln)}',
    '.gc:hover{border-color:var(--pr)}',
    '.gc .im{width:48px;height:48px}',
    '.gc .tx{flex:1;min-width:0}.gc b{display:block;font-size:14px;line-height:1.25}.gc small{font-size:12px;color:var(--mu)}',
    '.gc>svg{width:18px;height:18px;color:var(--pr);flex:none}',
    /* Masaüstü geçersiz kılmaları (temel kurallardan sonra) */
    '@media(min-width:760px){',
    ' .tabs{justify-content:flex-start;gap:4px;padding:8px 16px 0;background:var(--bg);border-bottom:1px solid var(--ln)}',
    ' .tb{flex:none;padding:0 18px;height:44px;font-size:14px;border-radius:12px 12px 0 0;border:1px solid transparent;border-bottom:0;margin-bottom:-1px;color:#4b5963}',
    ' .tb svg{display:block;width:18px;height:18px}.tb .tl{display:inline}.tb .ts{display:none}',
    ' .tb:hover{color:var(--ink)}',
    ' .tb.on{background:#fff;border-color:var(--ln);color:var(--pr)}',
    ' .mfoot{justify-content:flex-start;padding:10px 20px}.mfoot a{flex:none;padding:0 18px;height:42px}',
    ' .mfoot .tel .ts{display:none}',
    ' .cban{display:flex;justify-content:center;background:var(--bg)}.cban img{width:auto;max-width:100%;max-height:300px}',
    '}'
  ].join('\n');

  var host, root, $wrap, $ov, $panel, $q, $clr, $rail, $tools, $res, $idle, $home, $calc, $pages, $body, $cta, $mfoot, $help, $fab, $sheet, $toast;
  var $guide, GID = null;
  var isOpen = false, sel = -1, pushed = false;
  var catOpen = false, onlyStock = false, sortMode = 'rel', shown = PAGE, view = null, tab = 'home', VSTACK = [];
  // Geri tuşu için gezinme geçmişi (görünüm, arama, kaydırma konumu)
  function pushView() {
    VSTACK.push({ v: view, q: $q ? $q.value : '', s: $body ? $body.scrollTop : 0, n: CSHOWN });
    if (VSTACK.length > 20) VSTACK.shift();
  }
  var TABS = [['home', 'Kategoriler', 'grid', 'Kategoriler'], ['calc', 'Kaç Litre Toprak?', 'calc', 'Kaç Litre?'], ['guide', 'Kullanım Rehberi', 'book', 'Rehber'], ['pages', 'Sayfalar', 'doc', 'Sayfalar']];
  var BY_ID = {};

  function build() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'urun-arama-root';
    root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    root.innerHTML =
      '<style>' + CSS + '</style><div class="root">' +
      '<button class="fab hide" type="button" aria-label="Ürün bul"><span class="gl"></span><span class="fi">' + I.search + '</span><span class="t">Ürün Bul</span></button>' +
      '<div class="ptoast" role="status"></div>' +
      '<div class="ov"><div class="panel" role="dialog" aria-modal="true" aria-label="Ürün arama">' +
      '<div class="tabs" role="tablist">' + TABS.map(function (t) {
        return '<button class="tb" type="button" role="tab" data-act="tab" data-v="' + t[0] + '">' + I[t[2]] + '<span class="tl">' + t[1] + '</span><span class="ts">' + t[3] + '</span></button>';
      }).join('') + '</div>' +
      '<div class="top"><button class="back" type="button" data-act="back" aria-label="Geri">' + I.back + '</button>' +
      '<label class="field">' + I.search +
      '<input type="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Ara">' +
      '<button class="clr" type="button" data-act="clear" aria-label="Temizle">' + I.x + '</button></label>' +
      '<a class="cbtn" data-kind="page" data-name="Sepet" aria-label="Sepetim">' + I.cart + '<b class="cn"></b></a>' +
      '<button class="xbtn" type="button" data-act="close" aria-label="Kapat">' + I.x + '</button></div>' +
      '<div class="mid"><div class="help" hidden></div>' +
      '<div class="main"><div class="tools"></div>' +
      '<div class="body"><div class="idle"><div class="pane home on"></div><div class="pane calc-p"></div><div class="pane guide"></div><div class="pane pages"></div></div>' +
      '<div class="results" aria-live="polite"></div></div>' +
      '<div class="cta"></div><div class="xsell"></div><div class="shipbar"></div><div class="mfoot"></div>' +
      '<div class="sheet"></div><div class="toast"></div></div></div>' +
      '</div></div></div>';
    document.body.appendChild(host);
    var setFont = function () { host.style.fontFamily = getComputedStyle(document.body).fontFamily; };
    setFont();
    // Erken kurulumda sitenin CSS'i henüz inmemiş olabilir: yazı tipi sayfa yüklenince tekrar alınır
    if (document.readyState !== 'complete') window.addEventListener('load', setFont);
    $wrap = root.querySelector('.root');
    $fab = root.querySelector('.fab');
    $ov = root.querySelector('.ov');
    $panel = root.querySelector('.panel');
    $q = root.querySelector('.top input');
    $clr = root.querySelector('.clr');
    $help = root.querySelector('.help');
    $tools = root.querySelector('.tools');
    $res = root.querySelector('.results');
    $idle = root.querySelector('.idle');
    $home = root.querySelector('.pane.home');
    $calc = root.querySelector('.pane.calc-p');
    $pages = root.querySelector('.pane.pages');
    $guide = root.querySelector('.pane.guide');
    $body = root.querySelector('.body');
    $cta = root.querySelector('.cta');
    $mfoot = root.querySelector('.mfoot');
    updateShip();
    $sheet = root.querySelector('.sheet');
    $toast = root.querySelector('.toast');
    $q.placeholder = 'Ürün veya kategori ara';

    $q.addEventListener('input', function () { shown = PAGE; render(); });
    $q.addEventListener('keydown', onKey);
    $fab.addEventListener('click', function () { open(); });
    $ov.addEventListener('click', function (e) { if (e.target === $ov) close(); });
    $sheet.addEventListener('click', function (e) { if (e.target === $sheet) closeSheet(); });
    root.addEventListener('error', function (e) {
      var t = e.target;
      if (!t || t.tagName !== 'IMG' || !t.parentNode) return;
      // Bu boyut CDN'de yoksa bir kez standart boyutu dene, o da olmazsa simge göster
      var src = t.getAttribute('src') || '', alt = src.replace(/\/(\d+)\/([^/]+\.webp)$/, '/360/$2');
      if (alt !== src && !t.getAttribute('data-retry')) { t.setAttribute('data-retry', '1'); t.setAttribute('src', alt); return; }
      t.parentNode.innerHTML = I.sprout;
    }, true);
    root.addEventListener('click', onClick);
    // Parmak "Ekle"ye değdiği an ürün sayfasını gizli çerçevede açmaya başla (tıklama gelene kadar ~150-300 ms kazanç)
    root.addEventListener('pointerdown', function (e) {
      var b = e.target.closest && e.target.closest('[data-act="add"]');
      if (b && BY_ID[b.getAttribute('data-v')] && typeof window.UrunAramaSepet !== 'function' && cartOn()) prepAdd(BY_ID[b.getAttribute('data-v')]);
      if (e.target.closest && e.target.closest('.fab')) load().catch(function () {});
      var lk = e.target.closest && e.target.closest('a[data-kind="product"], a.li[href]');
      if (lk) prefetchRoute(lk.href);
    }, true);
    root.addEventListener('mouseover', function (e) { var lk = e.target.closest && e.target.closest('a[data-kind="product"]'); if (lk) prefetchRoute(lk.href); });
    // Görsel tamamen inince göster (mobil veride yarım çizilmiş görsel görünmesin)
    root.addEventListener('load', function (e) { if (e.target && e.target.tagName === 'IMG') e.target.classList.add('ok'); }, true);
    root.addEventListener('input', function (e) {
      if (e.target === $q) return;
      if (e.target.getAttribute('data-k') === 'gq') { GQ = e.target.value; guideSearch(); return; }
      calcInput(e.target);
    });
    root.addEventListener('focusin', function (e) { calcFocus(e.target, true); });
    root.addEventListener('focusout', function (e) { calcFocus(e.target, false); });
    $panel.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || e.target === $q) return;
      if ($sheet.classList.contains('on')) closeSheet(); else close();
    });
    setupFab();
    setTab(tab);
    if (DATA) applyConfig();
  }

  function onClick(e) {
    var t = e.target.closest ? e.target : e.target.parentElement;
    var b = t.closest('[data-act]');
    if (!b) {
      var a = t.closest('a[data-kind]');
      if (a) {
        if ($q.value.trim()) addRecent($q.value);
        track(a.getAttribute('data-kind'), a.getAttribute('data-name'));
        if (a.getAttribute('data-kind') === 'product') ev('c', slugOf(a.href));
        spaFromPanel(e, a);
      }
      return;
    }
    var act = b.getAttribute('data-act'), v = b.getAttribute('data-v');
    if (act === 'close') close();
    else if (act === 'back') {
      // Geri: önce aramayı temizle; sonra gelinen yere (ana bölüm, arama sonucu ya da önceki kategori) kaldığı konumla dön
      if ($q.value) { $q.value = ''; render(); }
      else if (VSTACK.length) {
        var e = VSTACK.pop();
        view = e.v; CSHOWN = e.n || 12;
        if (e.q) { $q.value = e.q; render(); }
        renderIdle();
        $body.scrollTop = e.s || 0;
      }
      else if (view) {
        var vc = CATS_BY_ID[inCatp() ? view.slice(2) : view], par = vc && vc.p && CATS_BY_ID[vc.p];
        view = par ? (inCatp() ? 'p:' + par.id : par.id) : null;
        CSHOWN = 12; renderIdle(); $body.scrollTop = 0;
      }
    }
    else if (act === 'clear') { $q.value = ''; render(); $q.focus(); }
    else if (act === 'q') { $q.value = v; shown = PAGE; render(); $q.focus(); }
    else if (act === 'del') { e.stopPropagation(); var f = fold(v); setRecent(getRecent().filter(function (x) { return fold(x) !== f; })); renderIdle(); }
    else if (act === 'delall') { setRecent([]); renderIdle(); }
    else if (act === 'catx') { catOpen = !catOpen; renderIdle(); }
    else if (act === 'cat') { pushView(); view = v || null; renderIdle(); $body.scrollTop = 0; }
    else if (act === 'stock') { onlyStock = !onlyStock; shown = PAGE; CSHOWN = 12; render(); if (inCatp()) renderIdle(); }
    else if (act === 'sort') { sortMode = v; shown = PAGE; CSHOWN = 12; render(); if (inCatp()) renderIdle(); }
    else if (act === 'cmore') { CSHOWN += 12; renderIdle(); }
    else if (act === 'catp') {
      if (view !== 'p:' + v) pushView();
      view = 'p:' + v; CSHOWN = 12;
      if ($q.value) { $q.value = ''; render(); }
      track('category', CATS_BY_ID[v] ? CATS_BY_ID[v].n : v);
      setTab('home'); renderIdle(); $body.scrollTop = 0;
    }
    else if (act === 'more') { shown += PAGE; render(); }
    else if (act === 'copy') copyText(v);
    else if (act === 'tab') { if ($q.value) { $q.value = ''; render(); } view = null; VSTACK = []; renderIdle(); setTab(v); }
    else if (act === 'gocalc') { $q.value = ''; render(); setTab('calc'); }
    else if (act === 'guide') { GID = v; renderGuide(); }
    else if (act === 'goguide') { GID = v; $q.value = ''; render(); setTab('guide'); }
    else if (act === 'goguideq') { GQ = v; $q.value = ''; render(); setTab('guide'); }
    else if (act === 'add') { var xs = !!b.getAttribute('data-xs'); if (xs) track('cross_sell_add', v); openAdd(v, xs); }
    else if (act === 'xsx') hideCross();
    else if (act === 'vo') pickVariant(v);
    else if (act === 'sq') { SH.qty = Math.max(1, Math.min(99, SH.qty + (+v))); $sheet.querySelector('.qty input').value = SH.qty; }
    else if (act === 'shx') closeSheet();
    else if (act === 'shgo') doAdd();
    else if (act === 'tocm') { e.preventDefault(); var ub = $calc.querySelector('.unit [data-v="cm"]'); if (ub) calcAction('unit', 'cm', ub); }
    else if (act === 'shape' || act === 'unit' || act === 'qty') calcAction(act, v, b);
  }

  function inCatp() { return view && view.indexOf('p:') === 0; }
  function tabOk(t) {
    if (t === 'calc') return calcEnabled();
    if (t === 'pages') return (CFG.pages || []).length > 0;
    if (t === 'guide') return (CFG.guides || []).length > 0;
    return true;
  }
  function setTab(t) {
    if (!tabOk(t)) t = 'home';
    tab = t;
    [].forEach.call(root.querySelectorAll('[data-act="tab"]'), function (b) {
      var v = b.getAttribute('data-v');
      b.classList.toggle('on', v === t);
      b.setAttribute('aria-current', v === t ? 'page' : 'false');
      b.style.display = tabOk(v) ? '' : 'none';
    });
    $home.classList.toggle('on', t === 'home');
    $panel.classList.toggle('sub', !!view && t === 'home');
    $calc.classList.toggle('on', t === 'calc');
    $pages.classList.toggle('on', t === 'pages');
    $guide.classList.toggle('on', t === 'guide');
    if (t === 'guide') renderGuide();
    if (t === 'calc') calcBuild();
    $body.scrollTop = 0;
  }

  function applyConfig() {
    try { hideNative(); } catch (e) {}
    if (!$wrap) return;
    var c = CFG.colors || {};
    if (c.primary) $wrap.style.setProperty('--pr', c.primary);
    if (c.dark) $wrap.style.setProperty('--prd', c.dark);
    if (c.soft) $wrap.style.setProperty('--soft', c.soft);
    if (c.accent) $wrap.style.setProperty('--ac', c.accent);
    // İkinci site paleti için ara tonlar (config > colors: hover, light, light2, dash, bg, line)
    [['hover', '--hov'], ['light', '--lt'], ['light2', '--lt2'], ['dash', '--dash'], ['bg', '--bg'], ['line', '--ln']].forEach(function (x) { if (c[x[0]]) $wrap.style.setProperty(x[1], c[x[0]]); });
    if (CFG.placeholder) $q.placeholder = CFG.placeholder;
    var fab = CFG.fab || {};
    $fab.querySelector('span.t').textContent = fab.text || 'Ürün Bul';
    $fab.classList.toggle('left', fab.side === 'left');
    if (fab.bottom != null) $wrap.style.setProperty('--fb', (+fab.bottom || 0) + 'px');
    updateFab();
    BY_ID = {};
    if (DATA) DATA.items.forEach(function (p) { BY_ID[p.id] = p; });

    // İletişim: masaüstünde sol menünün altında, mobilde alt çubukta
    var telHref = CFG.phone ? 'tel:' + CFG.phone.replace(/[^\d+]/g, '') : '';
    var wa = CFG.whatsapp ? '<a class="wa" data-kind="whatsapp" data-name="whatsapp" target="_blank" rel="noopener" href="' + esc(waHref()) + '">' + I.chat + '<span>WhatsApp</span></a>' : '';
    $help.innerHTML = wa || telHref ? '<b>Yardım mı lazım?</b><p>Doğru ürünü birlikte seçelim.</p>' + wa +
      (telHref ? '<a class="tel" data-kind="phone" data-name="phone" href="' + esc(telHref) + '">' + I.phone + '<span>' + esc(CFG.phone) + '</span></a>' : '') : '';
    $help.style.display = wa || telHref ? '' : 'none';
    $mfoot.innerHTML = wa + (telHref ? '<a class="tel" data-kind="phone" data-name="phone" href="' + esc(telHref) + '">' + I.phone + '<span class="ts">Bizi arayın</span><span class="tl">' + esc(CFG.phone) + '</span></a>' : '');
    $mfoot.classList.toggle('on', !!(wa || telHref));
    // Panel kapalıyken ana ekranı boşuna hazırlama (açılınca open() zaten çizer); veri yüklenirken telefonu yormasın
    if (isOpen) { renderIdle(); setTab(tab); }
  }

  function waHref(text) {
    return 'https://wa.me/' + String(CFG.whatsapp || '').replace(/\D/g, '') + (text ? '?text=' + encodeURIComponent(text) : '');
  }
  function pageHref(u) { return /^(https?:|tel:|mailto:)/.test(u) ? u : STORE + '/' + String(u || '').replace(/^\//, ''); }
  function url(slug) { return STORE + '/' + String(slug).replace(/^\//, ''); }

  function imgSrc(img, size) {
    if (/^https?:\/\//.test(img || '')) return img; // tam adres (kategori kapak görseli)
    var m = (SRC() || {}).merchant;
    if (!img || !m) return '';
    var parts = img.split('/');
    return 'https://cdn.myikas.com/images/' + m + '/' + parts[0] + '/' + size + '/' + encodeURIComponent(parts[1] || 'image') + '.webp';
  }
  // hi: ekranda ilk görünecek görsel → beklemeden ve öncelikli indir; diğerleri kaydırınca (lazy)
  function thumb(img, size, extra, hi) {
    var src = imgSrc(img, size);
    return '<div class="im">' + (src ? '<img ' + (hi ? 'fetchpriority="high"' : 'loading="lazy"') + ' decoding="async" alt="" src="' + esc(src) + '">' : I.sprout) + (extra || '') + '</div>';
  }


  // ---- Keşfet ----
  // Sıra: categoryOrder'dakiler verilen sırayla, sonra diğerleri (çok üründen aza), en sonda categoryLast
  function topCats() {
    var first = (CFG.categoryOrder || []).map(fold), last = (CFG.categoryLast || []).map(fold);
    var rank = function (c) {
      var i = first.indexOf(c.f), j = last.indexOf(c.f);
      return i >= 0 ? i : j >= 0 ? 1000 + j : 500;
    };
    return SRC().cats.filter(function (c) { return !c.p || !CATS_BY_ID[c.p]; })
      .sort(function (a, b) { return rank(a) - rank(b) || b.k - a.k; });
  }
  function catRow(c) {
    var inner = thumb(c.img, 180) + '<span class="n">' + esc(c.n) + '<small>' + c.k + ' ürün</small></span>' + I.right;
    return KIDS[c.id]
      ? '<button class="li" type="button" data-act="cat" data-v="' + esc(c.id) + '">' + inner + '</button>'
      : '<button class="li" type="button" data-act="catp" data-v="' + esc(c.id) + '">' + inner + '</button>';
  }
  function pageRows() {
    return (CFG.pages || []).map(function (pg) {
      return '<a class="li" data-kind="page" data-name="' + esc(pg.title) + '" href="' + esc(pageHref(pg.url)) + '">' +
        '<span class="ico">' + I.doc + '</span><span class="n">' + esc(pg.title) + '</span>' + I.right + '</a>';
    }).join('');
  }

  // Görselli menü: öne çıkan kategoriler (config.json > featured: [{ category, img }])
  function featuredHtml() {
    var list = (CFG.featured || []).map(function (f) {
      var ff = fold(f.category), c = SRC().cats.filter(function (x) { return x.f === ff; })[0];
      return c && f.img ? { c: c, img: f.img, title: f.title || c.n } : null;
    }).filter(Boolean);
    if (!list.length) return '';
    return '<div class="h">Öne çıkan kategoriler</div><div class="feat">' + list.map(function (x) {
      return '<button class="ft" type="button" data-act="catp" data-v="' + esc(x.c.id) + '">' +
        '<span class="fi"><img loading="lazy" alt="' + esc(x.title) + '" src="' + esc(x.img) + '"></span>' +
        '<span class="fn"><b>' + esc(x.title) + '</b><small>' + x.c.k + ' ürün</small></span></button>';
    }).join('') + '</div>';
  }
  // "Şu sıralar çok tercih edilenler": eğilim algoritmasının seçtikleri (sync.mjs > trend):
  // bu hafta hızla yükselenler, geçmiş yıllarda bu dönemde satan ve bu yıl da tutan sezon ürünleri, çok satanlar.
  // Sadece stoktaki ürünler; yeterli veri yoksa (4 üründen az) bölüm gösterilmez. Kapatmak: "trendBlock": false
  function hotHtml() {
    if (!DATA) return '';
    var t = DATA.trend || {};
    if (CFG.trendBlock === false || !t.src || !(t.src.orders || t.src.events)) return '';
    var tag = {}, list = [], seen = {};
    [['rising', 'Yükselen'], ['season', 'Sezonun ürünü'], ['best', 'Çok satan']].forEach(function (k) {
      (t[k[0]] || []).forEach(function (s) { if (!tag[s]) tag[s] = k[1]; });
    });
    // Ton/toptan gibi büyük hacimli ürünler (sıralamada geriye atılanlar) burada gösterilmez
    var push = function (p) { if (p && p.st && p.img && p.r > -4 && !seen[p.s] && list.length < 8) { seen[p.s] = 1; list.push(p); } };
    // Sıra: yükselen ve sezon önce (zamanlı fırsat), sonra çok satan, kalan yer eğilim puanına göre
    (t.rising || []).concat(t.season || [], t.best || []).forEach(function (s) { push(BY_SLUG[s]); });
    DATA.items.filter(function (p) { return p.h; }).sort(function (a, b) { return b.h - a.h; }).forEach(push);
    if (list.length < 4) return '';
    return '<div class="h">Şu sıralar çok tercih edilenler</div><div class="hot">' + list.map(function (p) {
      return '<a class="hp" data-kind="product" data-name="' + esc(p.n) + '" href="' + esc(url(p.s)) + '">' + thumb(p.img, 180) +
        (tag[p.s] ? '<span class="hb">' + esc(tag[p.s]) + '</span>' : '') + '<b>' + esc(p.n) + '</b><small>' + tl(price(p)) + '</small></a>';
    }).join('') + '</div>';
  }
  // Kampanya kartı (config.json > promo): ilk sipariş kodu ve ücretsiz kargo eşiği
  function promoHtml() {
    var pr = CFG.promo;
    if (!pr || (!pr.code && !pr.shipping)) return '';
    return '<div class="promo">' + (pr.code ? '<div class="pm1"><span class="pbadge">' + I.tag + '</span><div class="tx"><b>' + esc(pr.title || 'İlk siparişe özel indirim') + '</b>' +
      (pr.note ? '<span>' + esc(pr.note) + '</span>' : '') + '</div>' +
      '<button class="pcode" type="button" data-act="copy" data-v="' + esc(pr.code) + '"><b>' + esc(pr.code) + '</b><em>Kopyala</em></button></div>' : '') +
      (pr.shipping ? '<div class="pm2">' + I.truck + '<span class="pmship">' + shipText(true) + '</span></div>' : '') + '</div>';
  }
  // Güven şeridi (config.json > trust: [{ icon: leaf|shield|chat|truck, title, text }])
  function trustHtml() {
    var list = CFG.trust || [];
    if (!list.length) return '';
    return '<div class="trust">' + list.map(function (t) {
      return '<div class="tru">' + (I[t.icon] || I.check) + '<span><b>' + esc(t.title) + '</b>' + (t.text ? '<small>' + esc(t.text) + '</small>' : '') + '</span></div>';
    }).join('') + '</div>';
  }
  // ---- Ücretsiz kargo ilerlemesi: sepet tutarı ikas'ın kendi sepet yanıtlarından okunur ----
  function shipLimit() {
    var pr = CFG.promo || {};
    if (pr.freeShipping) return +pr.freeShipping;
    var m = String(pr.shipping || '').replace(/\./g, '').match(/(\d+)\s*(tl|₺)/i);
    return m ? +m[1] : 0;
  }
  function shipText(inPromo) {
    var lim = shipLimit(), c = CART;
    if (!lim || c == null) return esc((CFG.promo || {}).shipping || '');
    var left = lim - c;
    if (left <= 0) return '<b>Tebrikler, kargonuz ücretsiz!</b>';
    return (inPromo && c <= 0 ? esc((CFG.promo || {}).shipping || '') : 'Ücretsiz kargo için <b>' + tl(Math.ceil(left)) + '</b>\'lik daha ürün ekleyin');
  }
  // ---- Çapraz satış: ürün eklenince onayla birlikte en fazla 2 tamamlayıcı ürün (config.json > crossSell) ----
  // [{ "when": ["Kategori adı", ...], "offer": ["ürün-slug", "#Kategori adı" (kategorinin en iyisi)] }]
  var XS_MAX = 3, ADDED = {}, xsTimer = null;
  function catChain(p) {
    var out = [];
    p.c.forEach(function (id) { for (var c = CATS_BY_ID[id]; c; c = c.p && CATS_BY_ID[c.p]) if (out.indexOf(c.f) === -1) out.push(c.f); });
    return out;
  }
  function crossFor(p) {
    var chain = catChain(p), picked = [], bySlug = {};
    DATA.items.forEach(function (x) { bySlug[x.s] = x; });
    (CFG.crossSell || []).forEach(function (r) {
      if (!(r.when || []).some(function (n) { return chain.indexOf(fold(n)) !== -1; })) return;
      (r.offer || []).forEach(function (o) {
        var cands = [];
        if (o.charAt(0) === '#') {
          var cf = fold(o.slice(1)), cat = DATA.cats.filter(function (c) { return c.f === cf; })[0];
          if (cat) cands = DATA.items.filter(function (x) { return catChain(x).indexOf(cat.f) !== -1; })
            .sort(function (a, b) { return (b.r || 0) - (a.r || 0); });
        } else if (bySlug[o]) cands = [bySlug[o]];
        for (var i = 0; i < cands.length; i++) {
          var x = cands[i];
          if (x.st && x.id !== p.id && !ADDED[x.id] && picked.indexOf(x) === -1) { picked.push(x); break; }
        }
      });
    });
    return picked.slice(0, 2);
  }
  function xsCount(inc) {
    var n = 0;
    try { n = +sessionStorage.getItem('ua-xs') || 0; if (inc) sessionStorage.setItem('ua-xs', n + 1); } catch (e) {}
    return n;
  }
  function hideCross() { var el = root && root.querySelector('.xsell'); if (el) el.classList.remove('on'); clearTimeout(xsTimer); }
  // Sepete eklendi onayı: öneri varsa kartta, yoksa normal bildirim
  function addedMsg(p, v, fromXs) {
    ADDED[p.id] = 1;
    var msg = 'Sepete eklendi' + (v.name ? ': ' + v.name : '') + shipNote();
    var list = !fromXs && isOpen && DATA && (CFG.crossSell || []).length && xsCount() < XS_MAX ? crossFor(p) : [];
    if (!list.length) { hideCross(); ptoast(msg, false, true); return; }
    xsCount(true);
    var pt = root.querySelector('.ptoast');
    if (pt) { pt.classList.remove('on'); clearTimeout(ptoast.t); }
    var el = root.querySelector('.xsell');
    el.innerHTML = '<div class="xs-ok">' + I.check + '<span>' + esc(msg) + '</span><a href="' + esc(pageHref(CFG.cartUrl || '/cart')) + '">Sepete git</a>' +
      '<button type="button" data-act="xsx" aria-label="Kapat">' + I.x + '</button></div>' +
      '<div class="xs-h">Yanına iyi gider</div><div class="xs-l">' + list.map(function (x) {
        var href = esc(url(x.s));
        return '<div class="xs-i">' + thumb(x.img, 180) + '<div class="tx"><a data-kind="product" data-name="' + esc(x.n) + '" href="' + href + '">' + esc(x.n) + '</a>' +
          (price(x) != null ? '<b>' + (x.multi ? tl(price(x)) + '\'den' : tl(price(x))) + '</b>' : '') + '</div>' +
          '<button class="add" type="button" data-act="add" data-xs="1" data-v="' + esc(x.id) + '" aria-label="Sepete ekle">' + I.plus + '<span>Ekle</span></button></div>';
      }).join('') + '</div>';
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    track('cross_sell_show', p.n);
    var arm = function (ms) { clearTimeout(xsTimer); xsTimer = setTimeout(hideCross, ms); };
    arm(12000);
    el.onpointerenter = function () { clearTimeout(xsTimer); };
    el.onpointerleave = function () { arm(6000); };
  }
  function shipNote() {
    var lim = shipLimit();
    if (!lim || CART == null) return '';
    return CART >= lim ? ' · Kargonuz ücretsiz!' : ' · Ücretsiz kargoya ' + tl(Math.ceil(lim - CART)) + ' kaldı';
  }
  function updateShip() {
    if (!root) return;
    var cb = root.querySelector('.cbtn');
    if (cb) cb.setAttribute('href', pageHref(CFG.cartUrl || '/cart'));
    var cn = root.querySelector('.cn');
    if (cn) {
      var had = cn.textContent, txt = CART_N > 99 ? '99+' : CART_N > 0 ? String(CART_N) : '';
      cn.textContent = txt;
      cn.classList.toggle('on', !!txt);
      if (txt && had && had !== txt) { cn.classList.remove('on'); void cn.offsetWidth; cn.classList.add('on'); }
    }
    [].forEach.call(root.querySelectorAll('.pmship'), function (el) { el.innerHTML = shipText(true); });
    var bar = root.querySelector('.shipbar'), lim = shipLimit();
    if (!bar) return;
    var on = lim > 0 && CART != null && CART > 0;
    bar.classList.toggle('on', on);
    if ($wrap) $wrap.classList.toggle('sbon', on);
    if (!on) return;
    var pct = Math.min(100, Math.round(CART / lim * 100)), ok = CART >= lim;
    if (!bar.firstChild) bar.innerHTML = '<div class="sbt"><span class="sbi"></span><span class="sbx"></span></div><div class="sbr"><i></i></div>';
    bar.classList.toggle('ok', ok);
    bar.querySelector('.sbi').innerHTML = ok ? I.check : I.truck;
    bar.querySelector('.sbx').innerHTML = shipText(false) + (ok ? '' : '<small>Sepetiniz: ' + tl(CART) + '</small>');
    var fill = bar.querySelector('.sbr i');
    requestAnimationFrame(function () { fill.style.width = pct + '%'; });
  }
  function copyText(t) {
    var ok = function () { ptoast('"' + t + '" kopyalandı, ödeme adımında kullanabilirsiniz.'); };
    try { if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t).then(ok, fallback); } catch (e) {}
    fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = t; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      ok();
    }
  }
  function renderIdle() {
    if (!$home) return;
    $panel.classList.toggle('sub', !!view);
    $pages.innerHTML = '<div class="h">Sayfalar</div><div class="list">' + pageRows() + '</div>';
    if (!SRC() || (!DATA && view && view.indexOf('p:') === 0)) { $home.innerHTML = '<div class="spin"></div>'; return; }
    if (view && view.indexOf('p:') === 0 && CATS_BY_ID[view.slice(2)]) { $home.innerHTML = homeWrap(renderCatProducts(CATS_BY_ID[view.slice(2)])); return; }
    if (view && CATS_BY_ID[view]) { $home.innerHTML = homeWrap(renderCat(CATS_BY_ID[view])); return; }
    view = null;
    var html = '';
    var rec = getRecent(), pop = popular();
    var seen = rec.map(fold);
    pop = pop.filter(function (t) { return seen.indexOf(fold(t)) === -1; });
    if (rec.length || pop.length) {
      html += '<div class="h">' + (rec.length ? 'Son ve sık aramalar<button type="button" data-act="delall">Geçmişi temizle</button>' : 'Sık arananlar') + '</div><div class="trend">' +
        rec.map(function (t) { return '<button class="tq rc" type="button" data-act="q" data-v="' + esc(t) + '">' + I.clock + esc(t) + '</button>'; }).join('') +
        pop.map(function (t) { return '<button class="tq" type="button" data-act="q" data-v="' + esc(t) + '">' + I.trend + esc(t) + '</button>'; }).join('') +
        '</div>';
    }
    // Mobil: tüm kategoriler en üstte açılır-kapanır kart (masaüstünde soldaki liste var)
    var tops = topCats();
    if (tops.length) {
      html += '<div class="catsec' + (catOpen ? ' open' : '') + '"><button class="cx" type="button" data-act="catx" aria-expanded="' + catOpen + '">' +
        '<span class="cxi">' + I.grid + '</span><span class="cxt"><b>Tüm kategoriler</b><small>' + tops.length + ' ana kategori · ' + itemCount() + ' ürün</small></span>' +
        '<span class="cxa">' + I.right + '</span></button>' +
        (catOpen ? '<div class="clist">' + tops.map(catRow).join('') + '</div>' : '') + '</div>';
    }
    html += promoHtml() + trustHtml() + hotHtml() + featuredHtml();
    $home.innerHTML = homeWrap(html);
    updateShip();
  }

  // Masaüstü: solda her zaman görünen kategori listesi (seçili olan ve üstleri açık), sağda içerik
  function homeWrap(main) {
    var cur = view ? CATS_BY_ID[view.indexOf('p:') === 0 ? view.slice(2) : view] : null, open = {};
    for (var c = cur; c; c = c.p && CATS_BY_ID[c.p]) open[c.id] = 1;
    var row = function (c, depth) {
      var kids = (KIDS[c.id] || []).slice().sort(function (a, b) { return b.k - a.k; });
      var isOpen = open[c.id] && kids.length;
      return '<button class="tr d' + depth + (cur && cur.id === c.id ? ' on' : '') + (isOpen ? ' op' : '') + '" type="button" data-act="catp" data-v="' + esc(c.id) + '">' +
        (depth ? '' : (kids.length ? I.right : '<i></i>')) + '<span>' + esc(c.n) + '</span><small>' + c.k + '</small></button>' +
        (isOpen ? kids.map(function (k) { return row(k, depth + 1); }).join('') : '');
    };
    return '<div class="hw"><aside class="cside"><div class="h">Kategoriler</div>' +
      '<button class="tr d0' + (!cur ? ' on' : '') + '" type="button" data-act="cat" data-v="">' + I.grid + '<span>Tümü</span><small>' + itemCount() + '</small></button>' +
      topCats().map(function (c) { return row(c, 0); }).join('') + '</aside><div class="hm">' + main + '</div></div>';
  }

  function renderCat(c) {
    var parent = c.p && CATS_BY_ID[c.p];
    return '<div class="ctitle">' + (parent ? '<em>' + esc(parent.n) + '</em>' : '') + '<span>' + esc(c.n) + '</span></div>' +
      '<button class="all-in" type="button" data-act="catp" data-v="' + esc(c.id) + '"><span>Tüm ' + esc(c.n) + ' (' + c.k + ')</span>' + I.arrow + '</button>' +
      '<div class="clist">' + (KIDS[c.id] || []).slice().sort(function (a, b) { return b.k - a.k; }).map(catRow).join('') + '</div>';
  }

  // Kategori ürünleri panelin içinde (ikas'a gitmeden): kapak görseli, alt kategoriler, filtre ve ürün kartları
  var CSHOWN = 12;
  function catIds(id) { return [id].concat((KIDS[id] || []).reduce(function (a, k) { return a.concat(catIds(k.id)); }, [])); }
  function renderCatProducts(c) {
    var parent = c.p && CATS_BY_ID[c.p], set = {};
    catIds(c.id).forEach(function (x) { set[x] = 1; });
    var items = DATA.items.filter(function (p) { return p.c.some(function (x) { return set[x]; }); });
    if (onlyStock) items = items.filter(function (p) { return p.st; });
    items = items.map(function (p, i) { return { p: p, h: [], i: i }; });
    items.sort(sortMode === 'rel'
      ? function (a, b) { return (b.p.st ? 1 : 0) - (a.p.st ? 1 : 0) || (b.p.r || 0) - (a.p.r || 0) || a.i - b.i; }
      : function (a, b) {
        var pa = price(a.p), pb = price(b.p);
        if (pa == null) return 1;
        if (pb == null) return -1;
        return sortMode === 'asc' ? pa - pb : pb - pa;
      });
    var html = '<div class="ctitle">' + (parent ? '<em>' + esc(parent.n) + '</em>' : '') + '<span>' + esc(c.n) + '</span><small>' + items.length + ' ürün</small></div>';
    var kids = (KIDS[c.id] || []).slice().sort(function (a, b) { return b.k - a.k; });
    if (kids.length) {
      html += '<div class="cats" style="padding-top:0">' + kids.map(function (k) {
        return '<button class="cc" type="button" data-act="catp" data-v="' + esc(k.id) + '">' + esc(k.n) + ' <small>' + k.k + '</small></button>';
      }).join('') + '</div>';
    }
    html += '<div class="ctools">' +
      '<button class="opt' + (onlyStock ? ' on' : '') + '" type="button" data-act="stock"><i></i>Stoktakiler</button>' +
      [['rel', 'Önerilen'], ['asc', 'En ucuz'], ['desc', 'En pahalı']].map(function (o) {
        return '<button class="opt' + (sortMode === o[0] ? ' on' : '') + '" type="button" data-act="sort" data-v="' + o[0] + '">' + o[1] + '</button>';
      }).join('') + '</div>';
    if (!items.length) return html + '<div class="empty"><b>Stokta ürün yok</b><p>Filtreyi kaldırıp tükenen ürünleri de görebilirsiniz.</p></div>';
    html += '<div class="grid">' + items.slice(0, CSHOWN).map(card).join('') + '</div>';
    schedulePrewarm(items[0].p);
    if (items.length > CSHOWN) html += '<button class="more" type="button" data-act="cmore">Daha fazla göster (' + (items.length - CSHOWN) + ')</button>';
    return html;
  }

  // ---- Sonuçlar ----
  function price(p) { return p.d != null ? p.d : p.p; }
  function vPrice(v) { return v.d != null ? v.d : v.p; }
  function vOk(v) { return v.st > 0 || !!v.oos; }

  function card(x, i) {
    var p = x.p, badges = CFG.badges || {};
    var off = p.d != null && p.p ? Math.round((1 - p.d / p.p) * 100) : 0;
    var tagBadges = (p.best ? '<span class="badge best">' + I.star + 'Çok satan</span>' : '') +
      (p.t || []).filter(function (t) { return badges[t]; })
      .map(function (t) { return '<span class="badge">' + esc(badges[t]) + '</span>'; }).join('');
    if (tagBadges) tagBadges = '<div class="badges">' + tagBadges + '</div>';
    var vnames = (p.v || []).map(function (v) { return v.name; }).filter(Boolean);
    var chip = vnames.length > 1 ? vnames.length + ' seçenek · ' + vnames[0] + ' – ' + vnames[vnames.length - 1] : vnames[0] || '';
    var pr = p.p == null ? '' :
      (p.d != null ? '<b class="dsc">' + tl(p.d) + '</b><s>' + tl(p.p) + '</s>' : '<b>' + tl(p.p) + '</b>') +
      (p.multi ? '<small>başlayan fiyatlarla</small>' : '');
    var href = esc(url(p.s));
    return '<div class="card"><a class="ph" data-kind="product" data-name="' + esc(p.n) + '" href="' + href + '">' +
      thumb(p.img, slowNet() ? 180 : 360, (off >= 1 ? '<span class="off">-%' + off + '</span>' : '') + (p.st ? '' : '<span class="oosb">Tükendi</span>'), i < 4) + '</a>' +
      '<div class="cb"><a class="pname" data-kind="product" data-name="' + esc(p.n) + '" href="' + href + '">' + highlight(p.n, p.nf, x.h) + '</a>' +
      (chip ? '<span class="vchip">' + esc(chip) + '</span>' : '') + tagBadges +
      '<div class="pr">' + pr + '</div>' +
      '<div class="acts"><a class="see" data-kind="product" data-name="' + esc(p.n) + '" href="' + href + '">İncele</a>' +
      (cartOn() ? '<button class="add" type="button" data-act="add" data-v="' + esc(p.id) + '"' + (p.st ? '' : ' disabled') + '>' + I.cart + '<span>' + (p.st ? 'Ekle' : 'Tükendi') + '</span></button>' : '') +
      '</div></div></div>';
  }

  function render() {
    if (!$q) return;
    var q = $q.value;
    var typing = q.trim().length > 0;
    $panel.classList.toggle('typing', typing);
    $clr.classList.toggle('on', q.length > 0);
    sel = -1;
    if (!typing) { $res.innerHTML = ''; $tools.classList.remove('on'); $cta.classList.remove('on'); return; }
    if (!DATA) { $res.innerHTML = '<div class="spin"></div>'; return; }

    var r = search(q), html = '';
    var items = r.items;
    noteQuery(q, r.items.length);
    if (onlyStock) items = items.filter(function (x) { return x.p.st; });
    if (sortMode !== 'rel') {
      items = items.slice().sort(function (a, b) {
        var pa = price(a.p), pb = price(b.p);
        if (pa == null) return 1;
        if (pb == null) return -1;
        return sortMode === 'asc' ? pa - pb : pb - pa;
      });
    }

    $tools.innerHTML =
      '<button class="opt' + (onlyStock ? ' on' : '') + '" type="button" data-act="stock"><i></i>Stoktakiler</button>' +
      [['rel', 'Önerilen'], ['asc', 'En ucuz'], ['desc', 'En pahalı']].map(function (o) {
        return '<button class="opt' + (sortMode === o[0] ? ' on' : '') + '" type="button" data-act="sort" data-v="' + o[0] + '">' + o[1] + '</button>';
      }).join('');
    $tools.classList.toggle('on', r.items.length > 1);

    if (r.items.length) {
      $cta.classList.remove('on');
    } else $cta.classList.remove('on');

    html += guideCards(r.tokens);
    var spl = plantFor(fold(q));
    if (spl) html += soilCard(spl);
    if (calcEnabled() && r.tokens.some(function (t) { return /^(hacim|litre|kac|hesap|olcu|metrekup)/.test(t); })) {
      html += '<button class="banner" type="button" data-act="gocalc"><span class="bi">' + I.calc + '</span><div class="tx"><b>Toprak hesaplayıcı</b>' +
        '<span>Ölçüleri gir, kaç litre gerektiğini öğren</span></div>' + I.arrow + '</button>';
    }
    var pages = (CFG.pages || []).filter(function (pg) {
      var f = fold(pg.title);
      return r.tokens.every(function (t) { return words(f).some(function (w) { return w.indexOf(t) === 0; }); });
    });
    if (pages.length) {
      html += '<div class="list" style="padding-top:10px">' + pages.slice(0, 3).map(function (pg) {
        return '<a class="li" data-kind="page" data-name="' + esc(pg.title) + '" href="' + esc(pageHref(pg.url)) + '">' +
          '<span class="ico">' + I.doc + '</span><span class="n">' + esc(pg.title) + '</span>' + I.right + '</a>';
      }).join('') + '</div>';
    }

    if (!items.length && !r.cats.length && !html) {
      var pop = popular();
      var sugg = pop.filter(function (p) {
        return r.tokens.some(function (t) { return lev(fold(p).slice(0, t.length), t) <= 2; });
      }).slice(0, 4);
      if (!sugg.length) sugg = pop.slice(0, 4);
      var filtered = onlyStock && r.items.length;
      $res.innerHTML = '<div class="empty"><div class="ic">' + I.search + '</div><b>' +
        (filtered ? 'Stokta eşleşen ürün yok' : '“' + esc(q.trim()) + '” için sonuç yok') + '</b><p>' +
        (filtered ? 'Filtreyi kaldırıp tükenen ürünleri de görebilirsiniz.' :
          'Yazımı kontrol edin ya da daha genel bir kelime deneyin.' +
          (CFG.whatsapp ? ' Bulamadıysanız <a target="_blank" rel="noopener" href="' + esc(waHref('Merhaba, "' + q.trim() + '" arıyorum.')) + '">WhatsApp\'tan sorun</a>.' : '')) +
        '</p></div>' +
        (filtered ? '<div class="trend center"><button class="tq" type="button" data-act="stock">Tüm ürünleri göster</button></div>'
          : '<div class="trend center">' + sugg.map(function (t) { return '<button class="tq" type="button" data-act="q" data-v="' + esc(t) + '">' + I.trend + esc(t) + '</button>'; }).join('') + '</div>');
      if (!filtered) track('no_results', q);
      return;
    }

    if (r.cats.length) {
      html += '<div class="cats">' + r.cats.slice(0, 6).map(function (c) {
        return '<button class="cc" type="button" data-act="catp" data-v="' + esc(c.id) + '">' + esc(c.n) + ' <small>' + c.k + '</small></button>';
      }).join('') + '</div>';
    }
    if (items.length) {
      html += '<div class="h">Ürünler<small>' + items.length + ' sonuç</small></div><div class="grid">' +
        items.slice(0, shown).map(card).join('') + '</div>';
      if (items.length > shown) {
        html += '<button class="more" type="button" data-act="more">Daha fazla göster (' + (items.length - shown) + ')</button>';
      }
    }
    $res.innerHTML = html;
    if (items.length) schedulePrewarm(items[0].p);
  }

  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    var els = [].slice.call($res.querySelectorAll('.card'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') sel = Math.min(sel + 1, els.length - 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') sel = Math.max(sel - 1, -1);
    else if (e.key === 'Enter') {
      e.preventDefault();
      var q = $q.value.trim();
      if (!q) return;
      if (sel >= 0 && els[sel]) els[sel].querySelector('a.ph').click();
      else { addRecent(q); track('enter', q); $q.blur(); }
      return;
    } else return;
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && $q.selectionStart !== $q.value.length) { return; }
    e.preventDefault();
    els.forEach(function (el, i) { el.classList.toggle('sel', i === sel); });
    if (els[sel]) els[sel].scrollIntoView({ block: 'nearest' });
  }

  function track(kind, name) {
    try {
      (window.dataLayer = window.dataLayer || []).push({ event: 'urun_arama', search_action: kind, search_term: $q.value, search_target: name });
    } catch (e) {}
  }

  // ---------------- Hızlı sayfa geçişi ----------------
  // ikas sitesi Next.js ile çalışır; kendi linkleri sayfayı yenilemeden geçer. Panelden ve masaüstü menüden ürün /
  // kategori sayfalarına da aynı yönlendiriciyle geçilir (tam sayfa yeniden yüklenmez, çok daha hızlı).
  // Yönlendirici yoksa, hata verirse ya da 8 sn içinde bitmezse normal geçiş yapılır. Sepet, ödeme ve hesap
  // sayfalarına her zaman normal geçilir. Kapatmak: config.json > "spaNav": false
  var NO_SPA = /^\/(cart|sepet|checkout|odeme|account|hesap|login|giris|kayit|register|search|arama|pages)(\/|$)/i, PENDING_NAV = null;
  function nextRouter() {
    var n = window.next, r = n && n.router;
    return CFG.spaNav !== false && r && typeof r.push === 'function' && r.events && typeof r.events.on === 'function' ? r : null;
  }
  function sameOrigin(href) { try { var u = new URL(href, location.href); return u.origin === location.origin ? u : null; } catch (e) { return null; } }
  // Niyet anında (parmak değince / fare üstüne gelince) sayfanın kodunu önceden indir; geçiş ve sepete ekleme hızlanır
  function prefetchRoute(href) {
    var r = nextRouter(), u = r && typeof r.prefetch === 'function' && sameOrigin(href);
    if (!u || NO_SPA.test(u.pathname) || prefetchRoute[u.pathname]) return;
    prefetchRoute[u.pathname] = 1;
    try { var pr = r.prefetch(u.pathname + u.search); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {}
  }
  function spaTarget(e, a) {
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank' || a.hasAttribute('download')) return null;
    var r = nextRouter(), u = r && sameOrigin(a.href);
    if (!u || NO_SPA.test(u.pathname) || (u.pathname === location.pathname && u.search === location.search)) return null;
    return { r: r, u: u };
  }
  function routerPush(t) {
    var r = t.r, u = t.u, done = false, to;
    var cleanup = function () { clearTimeout(to); try { r.events.off('routeChangeComplete', onOk); r.events.off('routeChangeError', onErr); } catch (x) {} };
    var hard = function () { if (done) return; done = true; cleanup(); location.assign(u.href); };
    var onOk = function () { if (done) return; done = true; cleanup(); };
    var onErr = function (err) { if (err && err.cancelled) return; hard(); };
    to = setTimeout(hard, 8000);
    try {
      r.events.on('routeChangeComplete', onOk);
      r.events.on('routeChangeError', onErr);
      var pr = r.push(u.pathname + u.search + u.hash);
      if (pr && pr.then) pr.then(function (res) { if (res !== false) onOk(); }, hard);
    } catch (x) { hard(); }
  }
  // Panelden geçiş: önce panelin açtığı geçmiş kaydı geri alınır (geri tuşu düzgün çalışsın), sonra yönlendirilir
  function spaFromPanel(e, a) {
    var t = spaTarget(e, a);
    if (!t) return false;
    e.preventDefault();
    var go = function () { routerPush(t); };
    if (isOpen && pushed) {
      pushed = false;
      PENDING_NAV = go;
      try { history.back(); } catch (x) {}
      setTimeout(function () { if (PENDING_NAV === go) { PENDING_NAV = null; close(true); go(); } }, 450);
    } else { close(true); go(); }
    return true;
  }
  // Panel açıkken basılan geri tuşu sadece paneli kapatsın: Next.js bunu sayfa geçişi sanıp sayfayı yeniden
  // çizmesin / en üste kaydırmasın (Next'in resmi beforePopState kancası; sitenin kendi kancası varsa korunur)
  function hookNextPop() {
    var r = window.next && window.next.router;
    if (!r || typeof r.beforePopState !== 'function' || r.__uaPop) return;
    r.__uaPop = true;
    var prev = r._bps;
    try {
      r.beforePopState(function (st) {
        if (isOpen || PENDING_NAV || (st && st.urunArama)) return false;
        return typeof prev === 'function' ? prev(st) : true;
      });
    } catch (e) {}
  }

  // ---------------- Ziyaretçi eğilimleri ----------------
  // Anonim olarak (IP/çerez/kimlik yok) neyin arandığı, tıklandığı, görüntülendiği ve sepete eklendiği sayılır.
  // Olaylar toplu halde, sayfadan çıkarken tek istekle gönderilir; aynı olay bir oturumda bir kez sayılır.
  // Günlük toplamlar Cloudflare'de tutulur, scripts/sync.mjs 2 saatte bir okuyup sıralama ve önerilere işler.
  // Kapatmak: config.json > "analytics": false ya da script etiketine data-collect="off"
  var EVQ = [], EV_SEEN = {}, EV_T = 0, EV_URL = ds.collect === 'off' ? '' : (ds.collect || BASE + 'e');
  try { EV_SEEN = JSON.parse(sessionStorage.getItem('ua-ev') || '{}') || {}; } catch (e) {}
  function ev(k, x) {
    if (!EV_URL || !x || CFG.analytics === false) return;
    x = String(x).slice(0, 80);
    var key = k + '|' + x, n = 0;
    if (EV_SEEN[key]) return;
    for (var z in EV_SEEN) if (++n > 400) return;
    EV_SEEN[key] = 1;
    try { sessionStorage.setItem('ua-ev', JSON.stringify(EV_SEEN)); } catch (e) {}
    EVQ.push([k, x]);
    clearTimeout(EV_T);
    // Sayfadan çıkaran tıklamalar (ürün/menü bağlantısı) hemen gönderilir; diğerleri birkaç saniye biriktirilir
    EV_T = setTimeout(evFlush, EVQ.length >= 15 || k === 'c' || k === 'm' ? 0 : 4000);
  }
  function evFlush() {
    clearTimeout(EV_T);
    if (!EVQ.length || !EV_URL) return;
    var body = JSON.stringify({ e: EVQ.splice(0, 40) });
    try { if (navigator.sendBeacon && navigator.sendBeacon(EV_URL, body)) return; } catch (e) {}
    try { fetch(EV_URL, { method: 'POST', body: body, keepalive: true, mode: 'no-cors', credentials: 'omit' }); } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) evFlush(); });
  window.addEventListener('pagehide', evFlush);
  // Aranan kelime: yazmayı 1,5 sn bırakınca (her harf ayrı sayılmasın); sonuçsuz aramalar ayrı tutulur
  function noteQuery(q, n) {
    clearTimeout(noteQuery.t);
    q = String(q).toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
    if (q.length < 2) return;
    noteQuery.t = setTimeout(function () { ev(n ? 'q' : 'q0', q); }, 1500);
  }
  function cartAdded(vid) {
    if (DATA) { var p = BY_VAR[vid]; if (p) ev('a', p.s); } else ev('a', String(vid).toLowerCase());
  }
  // Ürün sayfası görüntüleme (ikas sayfa yenilemeden geçiş yapar; adres değişimi de izlenir)
  // Ürün verisi gerekmez: adres tek parçalıysa (ikas ürün adresi /urun-adi) gönderilir; kategori sayfaları menü
  // verisinden ayıklanır, ürün olmayan adresleri sync.mjs zaten yok sayar
  function evPage() {
    var path = location.pathname.replace(/\/+$/, ''), s = slugOf(location.href);
    if (!s || !/^[a-z0-9-]{2,140}$/.test(s) || path.split('/').length !== 2 || HIDE_PATHS.test(path) || /^(search|arama|pages|blog|account|hesap)$/.test(s)) return;
    if (DATA ? !BY_SLUG[s] : SRC() && SRC().cats.some(function (c) { return c.s === s; })) return;
    ev('v', s);
  }
  // "Sık arananlar": ziyaretçilerin son 30 günde en çok aradığı ve sonuç bulduğu kelimeler (sync.mjs > trend.q),
  // eksik kalırsa config.json > popular ile tamamlanır. config.json > "trendPopular": false sadece elle listeyi kullanır.
  function hasHit(f) {
    var toks = words(f).filter(function (w) { return w.length >= 2; });
    if (!toks.length) return false;
    for (var i = 0; i < DATA.items.length; i++) {
      var h = DATA.items[i].hay, ok = true;
      for (var j = 0; j < toks.length && ok; j++) if (h.indexOf(toks[j].length > 4 ? toks[j].slice(0, toks[j].length - 1) : toks[j]) === -1) ok = false;
      if (ok) return true;
    }
    return false;
  }
  function popular() {
    if (popular.c && popular.d === SRC()) return popular.c;
    var list = CFG.trendPopular === false ? [] : (((SRC() || {}).trend || {}).q || []), out = [], seen = {};
    list.concat(CFG.popular || []).forEach(function (t) {
      var f = fold(t);
      if (out.length >= 8 || seen[f]) return;
      seen[f] = 1;
      // Sadece bugün de sonuç veren kelimeler (ürün kaldırılmış olabilir); tam arama yerine hızlı kontrol:
      // kelimenin her parçası en az bir ürünün metninde geçiyor mu
      if (DATA && list.indexOf(t) !== -1 && !hasHit(f)) return;
      out.push(t);
    });
    popular.d = SRC();
    return (popular.c = out);
  }
  function evData() {
    evPage();
  }
  (function () {
    var last = location.pathname;
    var chk = function () { if (location.pathname !== last) { last = location.pathname; evPage(); dmActive(); } };
    ['pushState', 'replaceState'].forEach(function (m) {
      var o = history[m];
      if (typeof o !== 'function') return;
      history[m] = function () { var r = o.apply(this, arguments); setTimeout(chk, 0); return r; };
    });
    window.addEventListener('popstate', function () { setTimeout(chk, 0); });
  })();

  // ---------------- Kullanım rehberi ----------------
  // config.json > guides: [{ id, title, product (slug), url (rehber sayfası), keywords, note, groups: [{ cat, name, plants[], steps: [[zaman, şekil, doz]] }] }]
  function guides() { return CFG.guides || []; }
  function doseHtml(d) {
    // Ev ve bahçe kullanıcıları için küçük alan karşılığı:
    // 1 kg/dekar = 1 g/m² · 100 cc/dekar = 1 ml/10 m² · 1 L/dekar = 10 ml/10 m²
    var m = String(d).match(/^([\d.,]+)(?:\s*-\s*([\d.,]+))?\s*(kg|cc|L)\/dekar$/);
    if (!m) return esc(d);
    var k = m[3] === 'kg' ? 1 : m[3] === 'cc' ? 0.01 : 10, unit = m[3] === 'kg' ? ' g/m²' : ' ml / 10 m²';
    var f = function (x) { return (parseFloat(x.replace(',', '.')) * k).toLocaleString('tr-TR', { maximumFractionDigits: 1 }); };
    return esc(d) + '<small>≈ ' + f(m[1]) + (m[2] ? '-' + f(m[2]) : '') + unit + '</small>';
  }
  function stepsHtml(steps) {
    return '<div class="steps">' + steps.map(function (st) {
      return '<div class="sr"><b>' + esc(st[1]) + '</b><span>' + esc(st[0]) + '</span><em>' + doseHtml(st[2]) + '</em></div>';
    }).join('') + '</div>';
  }
  function guideGroup(gd, gr, open) {
    return '<details class="gg"' + (open ? ' open' : '') + '><summary><div><b>' + esc(gr.name) + '</b><small>' + esc(gr.plants.join(' · ')) + '</small></div>' + I.right + '</summary>' +
      (gr.steps && gr.steps.length ? stepsHtml(gr.steps) + (gr.note ? '<div class="gnote" style="margin:0 14px 12px">Not: ' + esc(gr.note) + '</div>' : '')
        : '<a class="glink" data-kind="guide" data-name="' + esc(gd.title) + '" href="' + esc(pageHref(gd.url)) + '">Dozları rehber sayfasında gör' + I.arrow + '</a>') +
      '</details>';
  }
  // Bitki adı eşleşmesi: kelimenin tamamı ya da (min harften uzunsa) başı
  function plantHit(gd, toks, min) {
    // Önce tam kelime ("elma" → Elma), bulunamazsa kelime başı ("elm" → Elma, "dom" → Domates)
    var find = function (exact) {
      var hit = null;
      (gd.groups || []).some(function (gr) {
        return gr.plants.some(function (pl) {
          var ws = words(fold(pl));
          var ok = toks.some(function (t) { return ws.some(function (w) { return exact ? w === t : t.length >= min && w.indexOf(t) === 0; }); });
          if (ok) hit = { gr: gr, pl: pl };
          return ok;
        });
      });
      return hit;
    };
    return find(true) || find(false);
  }
  function doseCard(gd, hit) {
    var has = hit && hit.gr.steps && hit.gr.steps.length;
    return '<div class="gcard"><div class="gc-h">' + I.book + '<div><b>' + (hit ? esc(hit.pl) + ' için ' : '') + esc(gd.title) + '</b><small>' +
      (hit ? esc(hit.gr.name) + ' · ' : '') + (has ? 'kullanım dozu' : 'doz bilgisi rehber sayfamızda') + '</small></div></div>' +
      (has ? stepsHtml(hit.gr.steps) + (hit.gr.note ? '<div class="gnote" style="margin:0 14px 12px">Not: ' + esc(hit.gr.note) + '</div>' : '') : '') +
      '<div class="gc-f"' + (has ? '' : ' style="padding-top:12px"') + '><a data-kind="guide" data-name="' + esc(gd.title) + '" href="' + esc(pageHref(gd.url)) + '">' + (has ? 'Tüm rehber' : 'Rehberi aç') + '</a>' +
      (gd.product ? '<a class="pri" data-kind="product" data-name="' + esc(gd.title) + '" href="' + esc(url(gd.product)) + '">Ürünü gör</a>' : '') + '</div></div>';
  }
  var GQ = '';
  // Rehber içi arama: "Hangi bitkide kullanacaksınız?" — tüm ürünlerin dozlarını birlikte göster
  // ---------------- Bitkiye göre toprak ----------------
  // config.json > soilMatch: bitki ve toprak profilleri (docs/bitki-toprak-eslestirme.xlsx). Yeni topraklar kendiliğinden
  // tanınır: (1) adında listedeki bir bitki geçiyorsa o bitkinin özel toprağı olur; (2) ikas'ta "pH:asidik",
  // "Drenaj:yüksek", "Su:orta", "Besin:zengin", "Yapı:havalı" (+ isteğe bağlı "Grup:salon", "Genel") etiketleri
  // varsa benzerlik önerilerine de girer.
  var SOIL = null;
  var TAGV = {
    ph: { asidik: 1, 'hafif asidik': 2, notr: 3, kirecli: 4, alkali: 4 },
    drenaj: { orta: 1, yuksek: 2, 'cok yuksek': 3 },
    su: { dusuk: 1, orta: 2, yuksek: 3 },
    besin: { dusuk: 1, orta: 2, zengin: 3, yuksek: 3 },
    yapi: { kumlu: 'k', havali: 'h', dengeli: 'd' }
  };
  function soilData() {
    if (SOIL) return SOIL;
    var sm = CFG.soilMatch || {}, bySlug = {}, soils = {}, groups = {};
    DATA.items.forEach(function (x) { bySlug[x.s] = x; });
    // Toprak: "pH drenaj su besin yapı|grup|bayraklar" (g=genel, o=sadece kendi bitkisi, v=tariften doğrulandı)
    var parse = function (str) {
      var a = String(str || '').split('|'), pr = a[0] || '';
      if (!/^[1-4][1-3][1-3][1-3][khd]$/.test(pr)) return null;
      return { ph: +pr[0], dr: +pr[1], su: +pr[2], bs: +pr[3], yp: pr[4], grp: fold(a[1] || ''), gen: /g/.test(a[2] || ''), only: /o/.test(a[2] || ''), v: /v/.test(a[2] || '') };
    };
    // Bitki: "pHmin pHmax drenaj su besin yapı"
    var parseP = function (pr) {
      pr = String(pr || '');
      if (!/^[1-4][1-4][1-3][1-3][1-3][khd]$/.test(pr)) return null;
      return { ph: +pr[0], ph2: +pr[1], dr: +pr[2], su: +pr[3], bs: +pr[4], yp: pr[5] };
    };
    Object.keys(sm.soils || {}).forEach(function (sl) { var pf = parse(sm.soils[sl]); if (pf && bySlug[sl]) soils[sl] = pf; });
    (sm.plants || []).forEach(function (pl) { groups[fold(pl[2] || '')] = 1; });
    // ikas etiketinden profil (yeni eklenen topraklar)
    DATA.items.forEach(function (x) {
      if (soils[x.s]) return;
      var v = {};
      (x.t || []).forEach(function (t) {
        var m = fold(t).match(/^(ph|drenaj|su|besin|yapi|grup)\s*[:=]\s*(.+)$/);
        if (m) v[m[1]] = m[2].trim(); else if (/^genel( amacli)?$/.test(fold(t))) v.gen = 1;
      });
      var ph = TAGV.ph[v.ph], dr = TAGV.drenaj[v.drenaj], su = TAGV.su[v.su], bs = TAGV.besin[v.besin], yp = TAGV.yapi[v.yapi];
      if (ph && dr && su && bs && yp) soils[x.s] = { ph: ph, dr: dr, su: su, bs: bs, yp: yp, grp: fold(v.grup || ''), gen: !!v.gen, only: false, v: true };
    });
    var plants = (sm.plants || []).map(function (pl) {
      var pf = parseP(pl[3]);
      if (!pf) return null;
      var names = [pl[0]].concat(String(pl[1] || '').split(',')).map(function (n) { return fold(n).trim(); }).filter(function (n) { return n.length >= 3; });
      return { n: pl[0], names: names, grp: fold(pl[2] || ''), pf: pf, special: pl[4] || '', strict: pl[5] === 's',
        // Kelimenin kendisi ya da kısa bir ekle (güller, limonun); "gülhatmi", "narenciye" eşleşmez
        res: names.map(function (n) { return new RegExp('(^| )' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[a-z]{0,' + (n.length <= 3 ? 3 : 4) + '}( |$)'); }) };
    }).filter(Boolean);
    // Adında bitki geçen toprak ürünleri (etiket gerekmeden): "HG Philodendron Toprağı" → Philodendron'un özel toprağı
    var soilCat = DATA.cats.filter(function (c) { return c.f === 'topraklar'; })[0];
    var soilItems = !soilCat ? [] : DATA.items.filter(function (x) {
      return !x.bn && /topra|torf|karisim/.test(x.nf) && catChain(x).indexOf(soilCat.f) !== -1;
    }).map(function (x) { return { x: x, nm: words(x.nf).join(' ') }; });
    plants.forEach(function (pl) {
      pl.auto = soilItems.filter(function (o) {
        return pl.res.some(function (re) { return re.test(o.nm); });
      }).map(function (o) { return o.x; }).sort(function (a, b) { return (b.st ? 1 : 0) - (a.st ? 1 : 0) || (b.r || 0) - (a.r || 0); });
    });
    SOIL = { soils: soils, plants: plants, bySlug: bySlug, w: sm.weights || [3, 2, 2, 1, 1, 12], add: sm.addons || {},
      min: sm.minFit != null ? +sm.minFit : 0.85, custom: sm.custom && bySlug[sm.custom] };
    return SOIL;
  }
  // Başka bir ürün türü aranıyorsa (domates tohumu, limon gübresi) toprak kartı çıkmaz
  var NOT_SOIL = /^(tohum|gubre|ilac|pompa|saksi|besin|vitamin|mama|fidesi|fidan|hormon|kok|sprey)/;
  function plantFor(qn) {
    if (!DATA || !CFG.soilMatch || qn.replace(/\s/g, '').length < 3) return null;
    var S = soilData(), ws = words(qn), q = ws.join(' '), best = null, bl = 0;
    S.plants.forEach(function (pl) {
      pl.res.forEach(function (re, i) { var n = pl.names[i]; if (re.test(q) && n.length > bl) { best = pl; bl = n.length; } });
    });
    var own = best ? words(best.names.join(' ')) : [];
    if (best && ws.some(function (w) { return NOT_SOIL.test(w) && own.indexOf(w) === -1; })) return null;
    return best;
  }
  function soilScore(pl, pf) {
    var w = soilData().w, a = pl.pf;
    // Toprağın pH'ı bitkinin aralığı içindeyse fark yok
    var d = w[0] * Math.max(0, a.ph - pf.ph, pf.ph - a.ph2) + w[1] * Math.abs(a.dr - pf.dr) + w[2] * Math.abs(a.su - pf.su) + w[3] * Math.abs(a.bs - pf.bs) + w[4] * (a.yp === pf.yp ? 0 : 1);
    return Math.max(0, 1 - d / w[5]);
  }
  // Öneri: özel toprak (ayarlardaki, yoksa adından bulunan) → yoksa profili en yakın toprak + eksik özellik için katkı
  function soilFor(pl) {
    var S = soilData();
    var sp = pl.special && S.bySlug[pl.special];
    if (sp && sp.st) return { p: sp, exact: true, adds: [] };
    var au = (pl.auto || []).filter(function (x) { return x.st; })[0];
    if (au) return { p: au, exact: true, adds: [] };
    // Ortamı çok özel bitkiler (orkide, asit sevenler…): özel toprak yoksa benzerini önermeyiz
    if (pl.strict) return { none: true, strict: true };
    var best = null, bs = -1;
    Object.keys(S.soils).forEach(function (sl) {
      var pf = S.soils[sl], x = S.bySlug[sl];
      // Sadece tarifi doğrulanmış (ya da ikas'ta etiketlenmiş) topraklar benzerlik önerisine girer
      if (!x || !x.st || pf.only || !pf.v || !(pf.gen || (pf.grp && pf.grp === pl.grp))) return;
      var sc = soilScore(pl, pf) + (pf.grp === pl.grp ? 0.002 : 0) + (pf.gen ? 0.001 : 0);
      if (sc > bs) { bs = sc; best = x; }
    });
    // Yeterince benzer hazır karışım yoksa (uyum < minFit) hiçbirini önermeyiz
    if (!best || bs < S.min) return { none: true };
    return { p: best, exact: false, fit: Math.min(1, bs), adds: addonsFor(pl, S.soils[best.s]) };
  }
  function addonsFor(pl, pf) {
    if (!pf) return [];
    var S = soilData(), a = pl.pf, out = [];
    var push = function (key, why) { var x = S.bySlug[S.add[key]]; if (x && x.st) out.push({ p: x, why: why }); };
    if (a.dr > pf.dr) push('drenaj', 'daha iyi süzülmesi için');
    if (a.ph2 < pf.ph) push('ph', 'pH\'ı düşürmek için');
    if (a.su > pf.su) push('su', 'nemi daha iyi tutması için');
    if (a.bs > pf.bs) push('besin', 'besin desteği için');
    return out.slice(0, 2);
  }
  function plantDesc(pf) {
    var PH = { 1: 'asidik', 2: 'hafif asidik', 3: 'nötr', 4: 'kireçli' };
    return [pf.ph2 && pf.ph2 !== pf.ph ? PH[pf.ph] + '–' + PH[pf.ph2] : PH[pf.ph], { 2: 'iyi süzen', 3: 'çok iyi süzen' }[pf.dr],
      { 1: 'çabuk kuruyan', 3: 'nemini koruyan' }[pf.su], { 1: 'besini az', 3: 'besince zengin' }[pf.bs],
      { k: 'kumlu', h: 'havalı' }[pf.yp]].filter(Boolean).join(', ');
  }
  function soilRow(x, note) {
    var href = esc(url(x.s));
    return '<div class="xs-i">' + thumb(x.img, 180) + '<div class="tx"><a data-kind="product" data-name="' + esc(x.n) + '" href="' + href + '">' + esc(x.n) + '</a>' +
      '<b>' + (price(x) != null ? (x.multi ? tl(price(x)) + '\'den' : tl(price(x))) : '') + (note ? ' <em>' + esc(note) + '</em>' : '') + '</b></div>' +
      (cartOn() ? '<button class="add" type="button" data-act="add" data-v="' + esc(x.id) + '" aria-label="Sepete ekle">' + I.plus + '<span>Ekle</span></button>' : '') + '</div>';
  }
  function soilCard(pl) {
    var r = soilFor(pl), S = soilData();
    if (!soilCard.seen) soilCard.seen = {};
    if (!soilCard.seen[pl.n]) { soilCard.seen[pl.n] = 1; track('soil_match', pl.n + ' → ' + (r.p ? r.p.n : 'yok')); }
    var custom = S.custom && S.custom.st ? soilRow(S.custom, 'bitkine göre hazırlatın') : '';
    var ask = CFG.whatsapp ? ' <a target="_blank" rel="noopener" href="' + esc(waHref('Merhaba, ' + pl.n + ' için hangi toprağı kullanmalıyım?')) + '">Uzmanımıza sorun</a>' : '';
    var head = function (txt) { return '<div class="soil"><div class="so-h">' + I.sprout + '<div><b>' + esc(pl.n) + ' için toprak</b><span>' + txt + '</span></div></div>'; };
    if (r.exact) return head(esc(pl.n) + ' için önerdiğimiz toprak:') + '<div class="so-l">' + soilRow(r.p, '') + '</div></div>';
    if (r.none) {
      return head(r.strict
        ? esc(pl.n) + ' çok özel bir yetiştirme ortamı ister; şu an buna uygun hazır toprağımız stokta yok. Yanlış toprak bitkiye zarar verebilir.' + ask
        : esc(pl.n) + ' için hazır karışımlarımızdan hiçbiri yeterince uygun değil. Bu bitki ' + esc(plantDesc(pl.pf)) + ' toprak sever; ihtiyacına göre karışım hazırlatabilirsiniz.' + ask) +
        (!r.strict && custom ? '<div class="so-l">' + custom + '</div>' : '') + '</div>';
    }
    return head(esc(pl.n) + ' için özel toprağımız yok. Bu bitki ' + esc(plantDesc(pl.pf)) + ' toprak sever. Özellikleri en yakın hazır karışımımız' +
      (r.adds.length ? ' ve eksik kalan özelliği tamamlayan ürün' : '') + ':') +
      '<div class="so-l">' + soilRow(r.p, '%' + Math.round(r.fit * 100) + ' uyum') +
      r.adds.map(function (a) { return soilRow(a.p, '+ ' + a.why); }).join('') + '</div>' +
      (custom ? '<div class="so-or">ya da bitkinizin ihtiyacına göre kendi karışımınızı hazırlatın:</div><div class="so-l">' + custom + '</div>' : '') + '</div>';
  }
  function guideSearch() {
    var res = $guide.querySelector('.gres'), lst = $guide.querySelector('.glist');
    if (!res) return;
    var toks = fold(GQ).trim().split(/\s+/).filter(function (t) { return t.length >= 2; });
    if (!toks.length) { res.innerHTML = ''; lst.style.display = ''; return; }
    lst.style.display = 'none';
    var hits = guides().map(function (gd) { return { gd: gd, hit: plantHit(gd, toks, 3) }; });
    var any = hits.some(function (x) { return x.hit; });
    var gpl = plantFor(fold(GQ)), soilHtml = gpl ? soilCard(gpl) : '';
    if (!any && soilHtml) { res.innerHTML = soilHtml; return; }
    if (!any) {
      res.innerHTML = '<div class="empty" style="padding:28px 8px 8px"><div class="ic">' + I.sprout + '</div><b>“' + esc(GQ.trim()) + '” rehberde yok</b><p>Bitki adını farklı yazmayı deneyin (örn. biber, elma, çim).' +
        (CFG.whatsapp ? ' Ya da <a target="_blank" rel="noopener" href="' + esc(waHref('Merhaba, ' + GQ.trim() + ' için gübre kullanım miktarını öğrenmek istiyorum.')) + '">WhatsApp\'tan sorun</a>.' : '') + '</p></div>';
      return;
    }
    // Dozu olanlar önce; eşleşme olmayan ama grubu olmayan (henüz verisi girilmemiş) rehberler bağlantı olarak
    hits.sort(function (a, b) { return (b.hit && b.hit.gr.steps.length ? 1 : 0) - (a.hit && a.hit.gr.steps.length ? 1 : 0); });
    res.innerHTML = soilHtml + hits.filter(function (x) { return x.hit || !(x.gd.groups || []).length; }).map(function (x) {
      return doseCard(x.gd, x.hit);
    }).join('');
  }
  function renderGuide() {
    var list = guides();
    if (!list.length || !$guide) return;
    var gd = list.filter(function (x) { return x.id === GID; })[0] || list[0];
    GID = gd.id;
    var html = '<div class="gd"><div class="gd-h"><b>Kullanım rehberi</b><p>Bitkinin adını yazın, tüm ürünlerimizin kullanım miktarlarını birlikte gösterelim.</p></div>' +
      '<label class="field gq">' + I.sprout + '<input type="search" data-k="gq" autocomplete="off" enterkeyhint="search" placeholder="Hangi bitkide kullanacaksınız?" value="' + esc(GQ) + '"></label>' +
      '<div class="gres"></div><div class="glist">' +
      '<div class="gsw">' + list.map(function (x) {
        return '<button type="button" data-act="guide" data-v="' + esc(x.id) + '" class="' + (x === gd ? 'on' : '') + '">' + esc(x.title) + '</button>';
      }).join('') + '</div>';
    var groups = gd.groups || [], lastCat = null;
    if (!groups.length) {
      html += '<a class="gprod" data-kind="guide" data-name="' + esc(gd.title) + '" href="' + esc(pageHref(gd.url)) + '"><span class="im" style="display:grid;place-items:center;color:var(--pr)">' + I.book + '</span>' +
        '<div class="tx"><b>' + esc(gd.title) + ' kullanım rehberi</b><small>Bitkiye göre dozlar rehber sayfamızda</small></div>' + I.arrow + '</a>';
    }
    groups.forEach(function (gr) {
      if (gr.cat !== lastCat) { html += '<div class="gcat">' + esc(gr.cat) + '</div>'; lastCat = gr.cat; }
      html += guideGroup(gd, gr, false);
    });
    var p = DATA && gd.product ? DATA.items.filter(function (x) { return x.s === gd.product; })[0] : null;
    if (p) {
      html += '<a class="gprod" data-kind="product" data-name="' + esc(p.n) + '" href="' + esc(url(p.s)) + '">' + thumb(p.img, 180) +
        '<div class="tx"><b>' + esc(p.n) + '</b><small>' + (p.p != null ? tl(price(p)) + (p.multi ? ' başlayan fiyatlarla' : '') : '') + '</small></div>' + I.arrow + '</a>';
    }
    if (gd.note) html += '<div class="gnote">' + esc(gd.note) + '</div>';
    $guide.innerHTML = html + '</div></div>';
    guideSearch();
  }
  // Aramada bitki adı geçiyorsa ilgili rehber grubunu kart olarak göster
  function guideCards(tokens) {
    var out = [], toks = tokens.filter(function (t) { return t.length >= 3; });
    if (!toks.length) return '';
    var q = toks.join(' ');
    var named = function (gd) { return (gd.keywords || []).some(function (k) { return q.indexOf(fold(k)) !== -1; }); };
    // Aramada bir ürün adı geçiyorsa (örn. "hümik asit domates") sadece o ürünün rehberi
    var list = guides().filter(named);
    if (list.length > 1) list = list.filter(function (gd) { return !list.some(function (o) { return o !== gd && (o.keywords || []).some(function (k) { return (gd.keywords || []).some(function (g) { return fold(k).indexOf(fold(g)) !== -1 && fold(k) !== fold(g); }); }); }); });
    if (!list.length) list = guides();
    var others = [], plantName = null;
    list.forEach(function (gd) {
      var hit = plantHit(gd, toks, 4);
      if (hit && hit.gr.steps && hit.gr.steps.length && out.length && list.length > 1) { others.push(gd.title); plantName = plantName || hit.pl; return; }
      var kwIn = named(gd), kw = kwIn && toks.some(function (t) { return /^(kullan|doz|nasil|miktar|rehber)/.test(t); });
      if (hit && !(hit.gr.steps && hit.gr.steps.length) && !kwIn) hit = null; // doz verisi olmayan rehber sadece adı geçince
      if (hit && hit.gr.steps && hit.gr.steps.length) {
        out.push(doseCard(gd, hit));
      } else if (kw && !hit && (gd.groups || []).length) {
        out.push('<button class="banner" type="button" data-act="goguide" data-v="' + esc(gd.id) + '" style="background:var(--soft);color:var(--prd)">' +
          '<span class="bi" style="background:#fff;color:var(--pr)">' + I.book + '</span><div class="tx"><b>' + esc(gd.title) + ' kullanım rehberi</b>' +
          '<span style="color:var(--mu)">Bitkiye göre doz ve uygulama zamanı</span></div>' + I.arrow + '</button>');
      } else if (hit || kw || (kwIn && !(gd.groups || []).length)) {
        out.push('<a class="banner" data-kind="guide" data-name="' + esc(gd.title) + '" href="' + esc(pageHref(gd.url)) + '" style="background:var(--soft);color:var(--prd)">' +
          '<span class="bi" style="background:#fff;color:var(--pr)">' + I.book + '</span><div class="tx"><b>' + (hit ? esc(hit.pl) + ' için ' : '') + esc(gd.title) + ' nasıl kullanılır?</b>' +
          '<span style="color:var(--mu)">Doz ve uygulama zamanı rehberimizde</span></div>' + I.arrow + '</a>');
      }
    });
    if (others.length) {
      out.push('<button class="banner" type="button" data-act="goguideq" data-v="' + esc(plantName) + '" style="background:var(--soft);color:var(--prd);margin-top:8px">' +
        '<span class="bi" style="background:#fff;color:var(--pr)">' + I.book + '</span><div class="tx"><b>' + esc(plantName) + ' için diğer ürünlerin dozları</b>' +
        '<span style="color:var(--mu)">' + esc(others.join(', ')) + '</span></div>' + I.arrow + '</button>');
    }
    return out.slice(0, 2).join('');
  }

  // ---------------- Sepete ekle ----------------
  // Sitenin sepetine ekleme yöntemi site koduna bağlıdır. window.UrunAramaSepet(varyantId, adet, ürün)
  // tanımlıysa (Promise dönebilir) o kullanılır; yoksa ürün sayfası seçili varyantla açılır.
  var SH = { p: null, v: null, qty: 1 };
  function cartOn() { return (CFG.cart || {}).enabled !== false; }

  function openAdd(id, xs) {
    var p = BY_ID[id];
    if (!p) return;
    var vs = (p.v || []).filter(function (v) { return v.id; });
    if (typeof window.UrunAramaSepet !== 'function') prepAdd(p);
    if (vs.length <= 1) { SH = { p: p, v: vs[0] || { id: p.v1, p: p.p, d: p.d, st: p.st }, qty: 1, xs: xs }; doAdd(); return; }
    var first = vs.filter(vOk)[0] || vs[0];
    SH = { p: p, v: first, qty: 1, xs: xs };
    $sheet.innerHTML = '<div class="sh-in" role="dialog" aria-label="Seçenek seç"><div class="sh-h">' + thumb(p.img, 180) + '<b>' + esc(p.n) + '</b>' +
      '<button type="button" data-act="shx" aria-label="Kapat">' + I.x + '</button></div>' +
      '<div class="sh-l">Seçenek</div><div class="vopts">' + vs.map(function (v) {
        var pr = vPrice(v);
        return '<button class="vo' + (v === first ? ' on' : '') + '" type="button" data-act="vo" data-v="' + esc(v.id) + '"' + (vOk(v) ? '' : ' disabled') + '>' +
          esc(v.name || 'Seçenek') + (pr != null ? '<small>' + tl(pr) + '</small>' : '') + '</button>';
      }).join('') + '</div>' +
      '<div class="sh-f">' + (typeof window.UrunAramaSepet === 'function' ? '<div class="qty"><button type="button" data-act="sq" data-v="-1" aria-label="Azalt">' + I.minus + '</button>' +
      '<input value="1" inputmode="numeric" aria-label="Adet" readonly><button type="button" data-act="sq" data-v="1" aria-label="Artır">' + I.plus + '</button></div>' : '') +
      '<button class="sh-go" type="button" data-act="shgo">' + I.cart + 'Sepete ekle</button></div>' +
      (CFG.promo && CFG.promo.shipping ? '<div class="sh-ship">' + I.truck + esc(CFG.promo.shipping) + '</div>' : '') + '</div>';
    $sheet.classList.add('on');
  }
  function pickVariant(id) {
    var v = (SH.p.v || []).filter(function (x) { return x.id === id; })[0];
    if (!v || !vOk(v)) return;
    SH.v = v;
    [].forEach.call($sheet.querySelectorAll('.vo'), function (b) { b.classList.toggle('on', b.getAttribute('data-v') === id); });
  }
  function closeSheet() { $sheet.classList.remove('on'); $sheet.innerHTML = ''; }
  function toast(msg) {
    $toast.innerHTML = I.check + esc(msg);
    $toast.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { $toast.classList.remove('on'); }, 2200);
  }
  function doAdd() {
    var p = SH.p, v = SH.v, qty = SH.qty, xs = SH.xs;
    if (!p || !v || BUSY[p.id]) return;
    track('add_to_cart', p.n);
    var fn = window.UrunAramaSepet;
    if (typeof fn === 'function') {
      Promise.resolve().then(function () { return fn(v.id, qty, { productId: p.id, slug: p.s, name: p.n }); }).then(function () {
        closeSheet();
        ptoast('Sepete eklendi', false, true);
      }, function () { addFailed(p); });
      return;
    }
    // Ürün sayfasını görünmez bir çerçevede aç; seçeneği seçip sitenin kendi "Sepete Ekle" butonuna bas.
    // Müşteri arama panelinden ayrılmaz.
    setBusy(p.id, true);
    directAdd(p, v).catch(function () { return queueFrameAdd(p, v); }).then(function () {
      setBusy(p.id, false);
      if (SH.p === p) closeSheet();
      // Sepet yanıtı kanıt anında işlendi (kalan ücretsiz kargo tutarı güncel); bildirim beklemeden gösterilir
      addedMsg(p, v, xs);
      track('add_to_cart_ok', p.n);
      ev('a', p.s);
    }, function (why) {
      setBusy(p.id, false);
      track('add_to_cart_fail', p.n + ' (' + why + ')');
      addFailed(p);
    });
  }
  function addFailed(p) {
    if (SH.p === p) closeSheet();
    ptoast('Sepete eklenemedi. Ürün sayfasından ekleyebilirsiniz.', true, false, url(p.s), 'Ürün sayfasına git');
  }
  function setBusy(id, on) {
    if (!!BUSY[id] === !!on) return;
    BUSY[id] = !!on;
    ADDING += on ? 1 : -1;
    var bs = root.querySelectorAll('[data-act="add"][data-v="' + id + '"]' + (SH.p && SH.p.id === id ? ', [data-act="shgo"]' : ''));
    [].forEach.call(bs, function (b) {
      if (on) { b.setAttribute('data-html', b.innerHTML); b.innerHTML = '<span class="bspin"></span><span>Ekleniyor</span>'; b.disabled = true; }
      else if (b.getAttribute('data-html') != null) { b.innerHTML = b.getAttribute('data-html'); b.removeAttribute('data-html'); b.disabled = false; }
    });
  }

  var FRAME = 'ua-sepet-cercevesi';
  // Çerçevedeki sayfanın sepet isteklerini izle (ikas sepete eklemeyi fetch/XHR ile yapar; adında "cart" geçer)
  // Çerçevedeki sayfanın isteklerini izle: istek gövdesi, durum ve cevap metni doğrulama için iletilir
  function watchCart(w, cb, onStart) {
    var interesting = function (u, body) { return /cart|sepet|graphql/i.test(String(u || '')) || (typeof body === 'string' && body.length < 20000); };
    try {
      var of = w.fetch;
      if (of) w.fetch = function (u, o) {
        var url = String(u && u.url || u), body = o && typeof o.body === 'string' ? o.body : '';
        var hit = interesting(url, body);
        if (hit && onStart) try { onStart({ url: url, body: body }); } catch (e) {}
        return of.apply(this, arguments).then(function (r) {
          if (hit && r) {
            try { r.clone().text().then(function (t) { cb({ url: url, body: body, ok: r.ok, status: r.status, text: t }); }, function () { cb({ url: url, body: body, ok: r.ok, status: r.status, text: '' }); }); } catch (e) {}
          }
          return r;
        });
      };
      var X = w.XMLHttpRequest && w.XMLHttpRequest.prototype;
      if (X) {
        var oo = X.open, os = X.send;
        X.open = function (m, u) { this.__ua = String(u); return oo.apply(this, arguments); };
        X.send = function (b) {
          var url = this.__ua, body = typeof b === 'string' ? b : '';
          if (interesting(url, body) && onStart) try { onStart({ url: url, body: body }); } catch (e) {}
          if (interesting(url, body)) this.addEventListener('load', function () {
            var t = '';
            try { t = this.responseType === '' || this.responseType === 'text' ? this.responseText : JSON.stringify(this.response); } catch (e) {}
            cb({ url: url, body: body, ok: this.status >= 200 && this.status < 300, status: this.status, text: t || '' });
          });
          return os.apply(this, arguments);
        };
      }
    } catch (e) {}
  }
  // Son eklemelerin kaydı (#ua-debug ile görülür): canlıda sorun olursa nedenini anlamak için
  function addLog(entry) {
    try {
      var a = JSON.parse(localStorage.getItem('ua-addlog') || '[]');
      a.unshift(entry); localStorage.setItem('ua-addlog', JSON.stringify(a.slice(0, 5)));
    } catch (e) {}
  }
  // Ürün sayfasını görünmez çerçevede önceden yükle (müşteri "Ekle"ye bastığı an; seçenek seçerken hazır olur)
  var FRAMES = {};
  function loadFrame(p) {
    var c = FRAMES[p.id];
    if (c && Date.now() - c.t < 90000) return c.pr;
    if (c && c.f.parentNode) c.f.parentNode.removeChild(c.f);
    var f = document.createElement('iframe');
    f.name = FRAME;
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    // Masaüstü genişliğinde aç: telefonda da ürün sayfasının masaüstü düzeni kullanılır
    f.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:1000px;border:0;opacity:0;pointer-events:none;';
    var entry = { f: f, t: Date.now(), cbs: [], starts: [] };
    entry.pr = new Promise(function (resolve, reject) {
      var to = setTimeout(function () { reject('timeout'); }, 20000), done = false, poll;
      var ready = function (early) {
        if (done) return;
        entry.early = early === true;
        var w, d;
        try { w = f.contentWindow; d = f.contentDocument; if (!d || !d.body) throw 0; } catch (e) { done = true; clearTimeout(to); clearInterval(poll); return reject('blocked'); }
        done = true;
        clearTimeout(to);
        clearInterval(poll);
        watchCart(w, function (info) { entry.cbs.forEach(function (cb) { cb(info); }); }, function (info) { entry.starts.forEach(function (cb) { cb(info); }); });
        sniffCart(w);
        learnAdd(w);
        resolve({ f: f, w: w, d: d, entry: entry });
      };
      f.onload = function () {
        entry.loaded = true;
        ready(false);
        var g = entry.onLoaded;
        entry.onLoaded = null;
        if (g) g();
      };
      // Sayfanın tüm görsellerinin inmesini bekleme: "Sepete ekle" butonu görünür ve React tarafından
      // çalışır hale getirilmişse (tıklama işleyicisi bağlı) hemen devam et. Mobil veride birkaç saniye kazandırır.
      poll = setInterval(function () { try { if (frameUsable(f)) ready(true); } catch (e) {} }, 120);
    });
    entry.pr.catch(function () { delete FRAMES[p.id]; });
    f.src = url(p.s) + (url(p.s).indexOf('?') < 0 ? '?' : '&') + 'ua_frame=1';
    document.body.appendChild(f);
    FRAMES[p.id] = entry;
    // Kullanılmazsa 90 sn sonra kaldır
    setTimeout(function () { if (FRAMES[p.id] === entry) { delete FRAMES[p.id]; if (f.parentNode) f.parentNode.removeChild(f); } }, 95000);
    return entry.pr;
  }
  // ---- Hızlı ekleme 1: sitenin sepete ekleme isteğini bir kez öğren, sonra sayfa açmadan doğrudan gönder ----
  var TPL_KEY = 'ua-addtpl', ADD_TPL = null, PENDING = null;
  try { ADD_TPL = JSON.parse(localStorage.getItem(TPL_KEY) || 'null'); } catch (e) {}
  function plainHeaders(h, w) {
    var o = {};
    try {
      if (!h) return o;
      if (w && w.Headers && h instanceof w.Headers || typeof h.forEach === 'function' && !Array.isArray(h)) h.forEach(function (v, k) { o[k] = v; });
      else if (Array.isArray(h)) h.forEach(function (x) { o[x[0]] = x[1]; });
      else for (var k in h) o[k] = h[k];
    } catch (e) {}
    return o;
  }
  function keepTpl(t, json) {
    if (!json || json.errors || !findCart(json)) return;
    var c = findCart(json);
    if (c.id) CART_ID = c.id;
    ADD_TPL = t;
    try { localStorage.setItem(TPL_KEY, JSON.stringify(t)); } catch (e) {}
  }
  function learnAdd(w) {
    try {
      var of = w.fetch;
      if (of && !of.__uaLearn) {
        w.fetch = function (u, o) {
          var pd = PENDING, body = o && typeof o.body === 'string' ? o.body : '', t = null;
          if (pd && body && body.indexOf(pd.vid) !== -1) {
            t = { url: new w.URL(u && u.url || String(u), w.location.href).href, method: (o.method || 'POST'), headers: plainHeaders(o.headers, w),
              body: body, cred: o.credentials || '', vid: pd.vid, pid: pd.pid };
          }
          return of.apply(this, arguments).then(function (r) {
            if (t && r && r.ok) r.clone().json().then(function (j) { keepTpl(t, j); }, function () {});
            return r;
          });
        };
        w.fetch.__uaLearn = true;
      }
      var X = w.XMLHttpRequest && w.XMLHttpRequest.prototype;
      if (X && !X.__uaLearn) {
        X.__uaLearn = true;
        var oo = X.open, os = X.send, sh = X.setRequestHeader;
        X.open = function (m, u) { this.__uaM = m; this.__uaL = new w.URL(String(u), w.location.href).href; this.__uaH = {}; return oo.apply(this, arguments); };
        X.setRequestHeader = function (k, v) { if (this.__uaH) this.__uaH[k] = v; return sh.apply(this, arguments); };
        X.send = function (b) {
          var pd = PENDING;
          if (pd && typeof b === 'string' && b.indexOf(pd.vid) !== -1) {
            var t = { url: this.__uaL, method: this.__uaM || 'POST', headers: this.__uaH || {}, body: b, cred: this.withCredentials ? 'include' : '', vid: pd.vid, pid: pd.pid };
            this.addEventListener('load', function () {
              if (this.status < 400) try { keepTpl(t, this.responseType === 'json' ? this.response : JSON.parse(this.responseText)); } catch (e) {}
            });
          }
          return os.apply(this, arguments);
        };
      }
    } catch (e) {}
  }
  function directAdd(p, v) {
    var t = ADD_TPL;
    if (!t || p.bn || !v || !v.id || (CFG.cart || {}).direct !== true) return Promise.reject('no-template');
    var body = t.body.split(t.vid).join(v.id).split(t.pid).join(p.id), hasCart = false;
    try {
      var j = JSON.parse(body);
      (function walk(o) {
        if (!o || typeof o !== 'object') return;
        for (var k in o) {
          if (k === 'cartId') { if (CART_ID) o[k] = CART_ID; hasCart = !!o[k]; }
          else walk(o[k]);
        }
      })(j);
      body = JSON.stringify(j);
    } catch (e) {}
    if (!hasCart) return Promise.reject('no-cart'); // yeni sepet açıp sitenin sepetinden ayrı düşmesin
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 8000);
    var init = { method: t.method, headers: t.headers, body: body, signal: ctl ? ctl.signal : undefined };
    if (t.cred) init.credentials = t.cred;
    return fetch(t.url, init).then(function (r) {
      clearTimeout(to);
      if (!r.ok) throw 'http-' + r.status;
      return r.json();
    }).then(function (j) {
      if (j && j.errors && j.errors.length) throw 'gql';
      setCart(j);
      track('add_direct', p.n);
      return 'direct';
    }).catch(function (e) {
      clearTimeout(to);
      // Şablon artık geçmiyorsa (sepet kapandı, kural değişti) unut; bir sonraki eklemede tekrar öğrenilir
      if (e === 'gql' || /^http-4/.test(String(e))) { ADD_TPL = null; try { localStorage.removeItem(TPL_KEY); } catch (x) {} }
      throw e;
    });
  }

  // ---- Hızlı ekleme 2: sıcak çerçeve ----
  // İlk BAŞARILI eklemeden sonra o gizli çerçeve kapatılmaz ("sıcak" kalır). Sonraki eklemelerde çerçeve, sitenin
  // kendi Next.js yönlendiricisiyle yeni ürüne sayfa yenilemeden geçer: site uygulaması baştan çalışmaz, yavaş
  // telefonda saniyeler kazanılır. Butona basmadan önce çerçevedeki sayfanın gerçekten o ürün olduğu (adres + ürün
  // başlığı) doğrulanır; doğrulanamazsa ürün kendi sayfasında tazeden açılır. Kapatmak: config.json > cart.warm: false
  var WARM = null, WARM_OFF = false, ADDQ = Promise.resolve(), BUSY = {}, ADDING = 0;
  function pathOf(p) { try { return new URL(url(p.s), location.href).pathname; } catch (e) { return ''; } }
  function warmOn() { return !WARM_OFF && (CFG.cart || {}).warm !== false; }
  function promoteWarm(fr) {
    if (!warmOn() || WARM || !fr || fr.warm) return false;
    var r;
    try { r = fr.w.next && fr.w.next.router; } catch (e) { return false; }
    if (!r || typeof r.push !== 'function' || !r.events || typeof r.events.on !== 'function') return false;
    for (var k in FRAMES) if (FRAMES[k] === fr.entry) delete FRAMES[k]; // 90 sn sonra silinmesin
    fr.warm = true;
    WARM = { fr: fr, last: Date.now() };
    return true;
  }
  function dropWarm() {
    if (WARM && WARM.fr && WARM.fr.f.parentNode) WARM.fr.f.parentNode.removeChild(WARM.fr.f);
    WARM = null;
  }
  // Kullanılmayan sıcak çerçeve (panel kapalı, 2 dk) bellekte tutulmaz
  // Panel kapanınca sıcak çerçeve 10 sn içinde kaldırılır (arkada site uygulaması çalışıp telefonu yormasın)
  setInterval(function () { if (WARM && !isOpen && !ADDING && Date.now() - WARM.last > 10000) dropWarm(); }, 5000);
  // Sıcak çerçevede ürüne geç (sitenin kendi yönlendiricisiyle, tam sayfa yüklemeden)
  function navWarm(p) {
    if (!WARM || !WARM.fr) return Promise.reject('no-warm');
    var fr = WARM.fr, path = pathOf(p), w, r;
    WARM.last = Date.now();
    try { w = fr.w; r = w.next && w.next.router; if (!r || typeof r.push !== 'function' || !path) throw 0; if (w.location.pathname === path) { fr.d = w.document; return Promise.resolve(fr); } } catch (e) { return Promise.reject('no-router'); }
    return new Promise(function (resolve, reject) {
      var done = false;
      var end = function (ok) {
        if (done) return;
        done = true;
        try { r.events.off('routeChangeComplete', okH); r.events.off('routeChangeError', errH); } catch (e) {}
        if (ok) setTimeout(function () { fr.d = w.document; resolve(fr); }, 80); else reject('route');
      };
      var okH = function () { try { end(w.location.pathname === path); } catch (e) { end(false); } };
      var errH = function (err) { if (!(err && err.cancelled)) end(false); };
      r.events.on('routeChangeComplete', okH);
      r.events.on('routeChangeError', errH);
      setTimeout(function () { end(false); }, 7000);
      try { var pr = r.push(path); if (pr && pr.catch) pr.catch(function () { end(false); }); } catch (e) { end(false); }
    });
  }
  function frameFor(p, fresh) {
    if (!fresh && warmOn() && WARM && WARM.fr) return navWarm(p).catch(function () { dropWarm(); return loadFrame(p); });
    return loadFrame(p);
  }
  // Çerçevedeki sayfa gerçekten bu ürünün sayfası mı (sıcak çerçevede yanlış ürüne basılmasın)
  function pageShows(p, fr) {
    try {
      if (fr.w.location.pathname !== pathOf(p)) return false;
      var want = fold(p.n).replace(/\s+/g, ' ').trim().slice(0, 22), hs = fr.d.querySelectorAll('h1, h2, [class*="title"], [class*="name"]');
      for (var i = 0; i < hs.length && i < 60; i++) if (fold(hs[i].textContent || '').replace(/\s+/g, ' ').indexOf(want) !== -1) return true;
    } catch (e) {}
    return false;
  }
  // Ürünler ekranda ve müşteri 1,2 sn duraksadıysa (yazmıyor/basmıyor) ilk ürünün sayfasını gizli çerçevede
  // önceden hazırla: ilk "Ekle" de sıcak çerçeveyle ~1 sn'de olur. Yavaş bağlantıda / veri tasarrufunda yapılmaz.
  var PREWARM_T = 0;
  function schedulePrewarm(p) {
    clearTimeout(PREWARM_T);
    // Varsayılan kapalı (gerçek ürün sayfası arkada çalışırken telefonda kaydırma takılabilir); config.json > cart.prewarm: true açar
    if ((CFG.cart || {}).prewarm !== true || !p || !p.st || WARM || ADDING || !cartOn() || !warmOn() || slowNet() || typeof window.UrunAramaSepet === 'function') return;
    PREWARM_T = setTimeout(function () {
      if (!isOpen || WARM || ADDING || document.hidden) return;
      loadFrame(p).then(function (fr) { if (!WARM && !ADDING) promoteWarm(fr); }, function () {});
    }, 1200);
  }
  // Eklemeler sırayla (aynı gizli çerçeve iki ürüne aynı anda gitmesin)
  function queueFrameAdd(p, v) {
    var run = ADDQ.then(function () { return addViaFrame(p, v); });
    ADDQ = run.catch(function () {});
    return run;
  }
  // "Ekle"ye basılınca / parmak değince: ürünü gizli çerçevede şimdiden aç (ekleme sürerken sıcak çerçeveye dokunma)
  function prepAdd(p) {
    if (BUSY[p.id]) return;
    if (warmOn() && WARM && WARM.fr) { if (!ADDING) navWarm(p).catch(function () {}); return; }
    loadFrame(p).catch(function () {});
  }
  function addViaFrame(p, v, fresh) {
    return frameFor(p, fresh).then(function (fr) {
      return new Promise(function (resolve, reject) {
        var d = fr.d, done = false, clicked = false, before = null;
        var finish = function (ok, why) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          fr.entry.cbs = [];
          PENDING = null;
          // Başarılı ilk ekleme çerçevesi sıcak çerçeve olur (sonraki eklemeler hızlı); diğerleri kaldırılır
          if (!fr.warm && !(ok && promoteWarm(fr))) {
            delete FRAMES[p.id];
            setTimeout(function () { if (fr.f.parentNode) fr.f.parentNode.removeChild(fr.f); }, 10000);
          }
          if (ok) resolve(); else if (why === 'warm-mismatch') resolve(addViaFrame(p, v, true)); else reject(why);
        };
        var seen = [], started = false, log = { t: new Date().toISOString(), urun: p.n, secenek: v.name || '', vid: v.id, adim: 'basladi', istekler: seen, erken: !!fr.entry.early };
        // Tıklamadan sonra site sepete/ürüne dair bir istek BAŞLATTI mı (cevabı beklemeden)
        fr.entry.starts = [function (info) {
          if (!clicked || done) return;
          var t = (info.url || '') + ' ' + String(info.body || '').slice(0, 4000);
          if (t.indexOf(v.id) !== -1 || t.indexOf(p.id) !== -1 || /cart|sepet/i.test(t)) started = true;
        }];
        var timer = setTimeout(function () { log.adim = clicked ? 'tiklandi-kanit-yok' : 'buton-bulunamadi'; addLog(log); finish(false, clicked ? 'no-proof' : 'timeout'); }, 15000);
        // Başarı ancak KANITLA: butona basıldıktan sonra sitenin kendi kodu bu seçeneği (varyant ya da ürün kimliği)
        // içeren bir istek gönderip hatasız cevap almalı. Kanıt yoksa "eklendi" denmez.
        fr.entry.cbs.push(function (info) {
          if (!clicked || done || !info) return;
          var hasId = (info.body + ' ' + info.url).indexOf(v.id) !== -1 || (v.id !== p.id && (info.body + ' ' + info.url).indexOf(p.id) !== -1);
          var gqlErr = /"errors"\s*:\s*\[\s*\{/.test(info.text || '');
          // Yedek kanıt: dönen sepette bu seçeneğin adedi tıklamadan öncekine göre artmış olmalı
          var grew = false;
          if (!hasId && info.ok && !gqlErr && before) {
            try { var c2 = findCart(JSON.parse(info.text)); if (c2) grew = (lineQty(c2)[v.id] || 0) > (before[v.id] || 0); } catch (e) {}
          }
          seen.push({ url: String(info.url).slice(0, 80), durum: info.status, kimlik: hasId, artis: grew, hata: gqlErr });
          if ((hasId && info.ok && !gqlErr) || grew) {
            log.adim = 'kanitlandi'; addLog(log);
            try { setCart(JSON.parse(info.text)); } catch (e) {}
            finish(true);
          } else if (hasId && (!info.ok || gqlErr)) {
            log.adim = 'site-hata-verdi'; addLog(log);
            finish(false, 'site-error');
          }
        });
        var tries = 0, picked = !((p.v || []).length > 1);
        (function step() {
          if (done) return;
          tries++;
          d = fr.d;
          // Sıcak çerçevede önce sayfanın doğru ürün olduğunu doğrula; 3 sn'de doğrulanamazsa tazeden aç
          if (fr.warm && !pageShows(p, fr)) {
            if (tries > 25) { WARM_OFF = true; dropWarm(); log.adim = 'sicak-cerceve-dogrulanamadi'; addLog(log); return finish(false, 'warm-mismatch'); }
            return setTimeout(step, 120);
          }
          var btn = findAddBtn(d);
          if (btn && !picked) {
            if (pickOnPage(v.name, d)) { picked = true; return setTimeout(step, 350); }
          } else if (btn) {
            clicked = true;
            before = CART_LINES ? JSON.parse(JSON.stringify(CART_LINES)) : null;
            PENDING = { vid: v.id, pid: p.id };
            btn.click();
            // Butona basıldıktan sonra en fazla 8 sn kanıt beklenir
            clearTimeout(timer);
            timer = setTimeout(function () { log.adim = 'tiklandi-kanit-yok'; addLog(log); finish(false, 'no-proof'); }, 8000);
            // Sayfa tam yüklenmeden basıldıysa ve site 1,5 sn içinde hiç istek başlatmadıysa (tıklama erken kaldı),
            // sayfa yüklenince BİR kez daha bas. İstek başlamışsa asla ikinci kez basılmaz (çift ekleme olmaz).
            if (fr.entry.early && !fr.entry.loaded) setTimeout(function () {
              if (done || started) return;
              var again = function () {
                if (done || started) return;
                var b2 = findAddBtn(fr.d);
                if (!b2) return;
                log.tekrar = true;
                b2.click();
                clearTimeout(timer);
                timer = setTimeout(function () { log.adim = 'tiklandi-kanit-yok'; addLog(log); finish(false, 'no-proof'); }, 8000);
              };
              if (fr.entry.loaded) again(); else fr.entry.onLoaded = again;
            }, 1500);
            return;
          }
          if (tries < 100) setTimeout(step, 120); else finish(false, btn ? 'variant' : 'button');
        })();
      });
    });
  }

  function ptoast(msg, warn, cartLink, href, label) {
    if (!root) return;
    var el = root.querySelector('.ptoast');
    var link = cartLink ? '<a href="' + esc(pageHref(CFG.cartUrl || '/cart')) + '">Sepete git</a>' : href ? '<a href="' + esc(href) + '">' + esc(label || 'Git') + '</a>' : '';
    el.innerHTML = (warn ? svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>', 2.2) : I.check) + '<span>' + esc(msg) + '</span>' + link;
    el.classList.toggle('warn', !!warn);
    el.classList.add('on');
    clearTimeout(ptoast.t);
    ptoast.t = setTimeout(function () { el.classList.remove('on'); }, warn ? 7000 : 5000);
  }
  function visible(el) { return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); }
  function squash(t) { return fold(t).replace(/\s+/g, ''); }
  function frameUsable(f) {
    var d = f.contentDocument, w = f.contentWindow;
    if (!d || !d.body || d.readyState === 'loading' || String(d.location && d.location.href).indexOf('ua_frame=1') === -1) return false;
    var b = findAddBtn(d);
    if (!b) return false;
    // React (Next.js) sayfası değilse erken başlatma; normal yüklenme beklenir
    if (!(w.__NEXT_DATA__ || d.getElementById('__next'))) return false;
    for (var n = b, i = 0; n && i < 4; n = n.parentElement, i++) {
      var ks = Object.keys(n);
      for (var j = 0; j < ks.length; j++) if (/^__reactProps\$/.test(ks[j]) && n[ks[j]] && typeof n[ks[j]].onClick === 'function') return true;
    }
    return false;
  }
  function findAddBtn(d) {
    var els = d.querySelectorAll('button,[role="button"],a,input[type="submit"]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (isOurs(el) || !visible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
      var t = fold(el.value || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (/sepete ?(ekle|at)|add to (cart|basket|bag)/.test(t) && t.length < 40) return el;
    }
    return null;
  }
  // Ürün sayfasında adı varyant adıyla birebir aynı olan seçeneği bul (buton, etiket, liste öğesi ya da select)
  function pickOnPage(name, d) {
    var want = squash(name), w = d.defaultView || window;
    if (!want) return false;
    var sels = d.querySelectorAll('select');
    for (var i = 0; i < sels.length; i++) {
      for (var j = 0; j < sels[i].options.length; j++) {
        if (squash(sels[i].options[j].text) === want) {
          var setter = Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set;
          setter.call(sels[i], sels[i].options[j].value);
          sels[i].dispatchEvent(new w.Event('change', { bubbles: true }));
          return true;
        }
      }
    }
    var all = d.body.querySelectorAll('button,[role="radio"],[role="option"],label,li,a,span,div,p');
    for (var k = 0; k < all.length; k++) {
      var el = all[k];
      if (el.children.length > 3 || !visible(el) || el.closest('header,nav,footer')) continue;
      if (squash(el.textContent) !== want) continue;
      var hit = el.closest('button,[role="radio"],[role="option"],label,a,li') || el;
      hit.click();
      return true;
    }
    return false;
  }

  // ---------------- Toprak hesaplayıcı ----------------
  // f: [anahtar, etiket, sabit birim (yoksa seçilen birim)]
  var SHAPES = {
    cyl: { n: 'Yuvarlak saksı', f: [['d', 'Çap'], ['h', 'Yükseklik']],
      v: function (x) { return Math.PI * Math.pow(x.d / 2, 2) * x.h; } },
    cone: { n: 'Konik saksı', f: [['d1', 'Ağız çapı'], ['d2', 'Taban çapı'], ['h', 'Yükseklik']],
      v: function (x) { return Math.PI * x.h / 12 * (x.d1 * x.d1 + x.d1 * x.d2 + x.d2 * x.d2); } },
    box: { n: 'Dikdörtgen saksı', f: [['w', 'En'], ['l', 'Boy'], ['h', 'Yükseklik']],
      v: function (x) { return x.w * x.l * x.h; } },
    bed: { n: 'Bahçe yatağı', f: [['bw', 'En'], ['bl', 'Boy'], ['bd', 'Toprak derinliği']],
      v: function (x) { return x.bw * x.bl * x.bd; } }
  };
  var SHAPE_ICON = {
    cyl: svg('<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/>'),
    cone: svg('<ellipse cx="12" cy="5.5" rx="8.5" ry="2.5"/><path d="M3.5 5.5 6.3 18.3c.3 1.3 2.8 2.2 5.7 2.2s5.4-.9 5.7-2.2l2.8-12.8"/>'),
    box: svg('<path d="M4 8.5 8 5h12v10.5L16 19H4z"/><path d="M4 8.5h12V19M16 8.5 20 5"/>'),
    bed: svg('<path d="M2 12.5 6 9.5h16v4l-4 3.5H2z"/><path d="M2 12.5h16V17M18 12.5l4-3"/>')
  };
  var C = { shape: 'cyl', val: {}, unit: { cyl: 'cm', cone: 'cm', box: 'cm', bed: 'cm' }, qty: 1, built: false };
  // Hesabın açık yazımı (değerler cm cinsinden): müşteri sonucu kendisi doğrulayabilsin
  function nf(n, d) { return n.toLocaleString('tr-TR', { maximumFractionDigits: d == null ? 2 : d }); }


  function calcEnabled() { return (CFG.calc || {}).enabled !== false; }
  function unitOf(k) {
    var f = SHAPES[C.shape].f.filter(function (x) { return x[0] === k; })[0];
    return (f && f[2]) || C.unit[C.shape];
  }

  // Ölçü çizgisi + etiket: uçlarda dik çentik, etiket (lx,ly) merkezli
  function dim(k, x1, y1, x2, y2, lx, ly) {
    var dx = x2 - x1, dy = y2 - y1, L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L * 5, ny = dx / L * 5;
    var tick = function (x, y) { return '<line class="dl" x1="' + (x - nx) + '" y1="' + (y - ny) + '" x2="' + (x + nx) + '" y2="' + (y + ny) + '"/>'; };
    return '<g class="dm" data-k="' + k + '"><line class="dl" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>' +
      tick(x1, y1) + tick(x2, y2) +
      '<g class="pl" data-k="' + k + '" data-x="' + lx + '" data-y="' + ly + '"><rect rx="11" height="22"/><text></text></g></g>';
  }
  function figure(shape) {
    var o = '<svg viewBox="0 0 260 200" aria-hidden="true">';
    if (shape === 'cyl') {
      o += '<path class="body-f" d="M70 52V152A60 14 0 0 0 190 152V52"/><ellipse class="soil" cx="130" cy="62" rx="58" ry="12.5"/>' +
        '<ellipse class="edge" cx="130" cy="52" rx="60" ry="14"/>' +
        dim('d', 70, 22, 190, 22, 130, 22) + dim('h', 214, 52, 214, 152, 214, 102);
    } else if (shape === 'cone') {
      o += '<path class="body-f" d="M62 50 88 152A42 10 0 0 0 172 152L198 50"/><ellipse class="soil" cx="130" cy="61" rx="64" ry="13"/>' +
        '<ellipse class="edge" cx="130" cy="50" rx="68" ry="15"/>' +
        dim('d1', 62, 18, 198, 18, 130, 18) + dim('d2', 88, 182, 172, 182, 130, 182) + dim('h', 222, 50, 222, 152, 222, 101);
    } else if (shape === 'box') {
      o += '<path class="body-f" d="M58 78 98 50H214V140L174 168H58Z"/><path class="soil" d="M62 86 98 60H208L172 86Z"/>' +
        '<path class="edge" d="M58 78H174V168M174 78 214 50"/>' +
        dim('w', 58, 186, 174, 186, 116, 186) + dim('l', 184, 176, 224, 148, 226, 180) + dim('h', 36, 78, 36, 168, 30, 123);
    } else {
      o += '<path class="body-f" d="M18 104 60 78H242V112L200 138H18Z"/><path class="soil" d="M22 110 60 84H236L198 110Z"/>' +
        '<path class="edge" d="M18 104H200V138M200 104 242 78M78 104V138M140 104V138"/>' +
        dim('bl', 18, 160, 200, 160, 109, 160) + dim('bw', 208, 150, 248, 124, 222, 172) + dim('bd', 250, 78, 250, 112, 222, 56);
    }
    return o + '</svg>';
  }
  function setLabel(k) {
    var g = $calc.querySelector('.pl[data-k="' + k + '"]');
    if (!g) return;
    var f = SHAPES[C.shape].f.filter(function (x) { return x[0] === k; })[0];
    var n = num(C.val[k]);
    var txt = n ? n.toLocaleString('tr-TR') + ' ' + unitOf(k) : f[1];
    var w = Math.round(txt.length * 7.6 + 18), x = +g.getAttribute('data-x'), y = +g.getAttribute('data-y');
    w = Math.min(w, 140);
    x = Math.max(w / 2 + 1, Math.min(260 - w / 2 - 1, x));
    var r = g.querySelector('rect'), t = g.querySelector('text');
    r.setAttribute('x', x - w / 2); r.setAttribute('y', y - 11); r.setAttribute('width', w);
    t.setAttribute('x', x); t.setAttribute('y', y + 4.5); t.textContent = txt;
    g.classList.toggle('v', !!n);
  }

  function calcBuild() {
    if (!C.built) {
      C.built = true;
      $calc.innerHTML = '<div class="calc">' +
        '<div class="c-head"><b>Kaç litre toprak lazım?</b><p>Saksını ya da yatağını seç, ölçülerini gir; kaç litre toprak alman gerektiğini söyleyelim.</p></div>' +
        '<div class="step s1"><span class="sn">1</span><div class="st-t">Ne dolduracaksın?</div><div class="chips">' +
        Object.keys(SHAPES).map(function (k) {
          return '<button class="sh" type="button" data-act="shape" data-v="' + k + '">' + SHAPE_ICON[k] + esc(SHAPES[k].n) + '</button>';
        }).join('') + '</div></div>' +
        '<div class="step s2"><span class="sn">2</span><div class="st-t">İç ölçüleri gir<div class="unit"></div></div>' +
        '<div class="dims"><div class="fig"></div><div class="inputs"></div></div></div>' +
        '<div class="step s3"><span class="sn">3</span><div class="st-t">Sonuç</div><div class="out"></div></div>' +
        '</div>';
    }
    calcShape(C.shape);
  }

  function calcShape(k) {
    C.shape = k;
    var s = SHAPES[k], u = C.unit[k];
    [].forEach.call($calc.querySelectorAll('.sh'), function (b) { b.classList.toggle('on', b.getAttribute('data-v') === k); });
    $calc.querySelector('.unit').innerHTML = ['cm', 'm'].map(function (x) {
      return '<button type="button" data-act="unit" data-v="' + x + '" class="' + (u === x ? 'on' : '') + '">' + x + '</button>';
    }).join('');
    $calc.querySelector('.fig').innerHTML = figure(k);
    $calc.querySelector('.inputs').innerHTML = s.f.map(function (f) {
      return '<div class="inp"><label for="ua-' + f[0] + '">' + esc(f[1]) + '</label><div class="b">' +
        '<input id="ua-' + f[0] + '" data-k="' + f[0] + '" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(C.val[f[0]] || '') + '">' +
        '<em data-u="' + f[0] + '">' + unitOf(f[0]) + '</em></div></div>';
    }).join('') +
      '<div class="inp"><label>' + (k === 'bed' ? 'Kaç yatak?' : 'Kaç saksı?') + '</label><div class="qty">' +
      '<button type="button" data-act="qty" data-v="-1" aria-label="Azalt">' + I.minus + '</button>' +
      '<input data-k="qty" inputmode="numeric" value="' + C.qty + '" aria-label="Adet">' +
      '<button type="button" data-act="qty" data-v="1" aria-label="Artır">' + I.plus + '</button></div></div>' +
      '<p class="tip">' + (k === 'bed' ? 'Sebze yatağında toprak derinliği en az 25–30 cm olmalı.' : 'Kenar kalınlığını saymadan, içten ölçün.') + '</p>';
    s.f.forEach(function (f) { setLabel(f[0]); });
    calcUpdate();
  }

  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return n > 0 ? n : 0; }

  function calcInput(el) {
    var k = el.getAttribute && el.getAttribute('data-k');
    if (!k || !$calc || !$calc.contains(el)) return;
    if (k === 'qty') { C.qty = Math.max(1, Math.min(999, parseInt(el.value, 10) || 1)); calcUpdate(); return; }
    C.val[k] = el.value;
    setLabel(k);
    calcUpdate();
  }
  function calcFocus(el, on) {
    var k = el.getAttribute && el.getAttribute('data-k');
    if (!k || !$calc || !$calc.contains(el)) return;
    var g = $calc.querySelector('.dm[data-k="' + k + '"]');
    if (g) { g.classList.toggle('on', on); g.querySelector('.pl').classList.toggle('on', on); }
  }
  function calcAction(act, v, b) {
    if (act === 'shape') calcShape(v);
    else if (act === 'unit') {
      C.unit[C.shape] = v;
      [].forEach.call(b.parentNode.children, function (x) { x.classList.toggle('on', x === b); });
      SHAPES[C.shape].f.forEach(function (f) {
        var em = $calc.querySelector('em[data-u="' + f[0] + '"]');
        if (em) em.textContent = unitOf(f[0]);
        setLabel(f[0]);
      });
      calcUpdate();
    } else if (act === 'qty') {
      C.qty = Math.max(1, Math.min(999, C.qty + (+v)));
      $calc.querySelector('.qty input').value = C.qty;
      calcUpdate();
    }
  }

  function need() {
    var s = SHAPES[C.shape], x = {}, ok = true;
    s.f.forEach(function (f) {
      var n = num(C.val[f[0]]);
      if (!n) ok = false;
      x[f[0]] = n * (unitOf(f[0]) === 'm' ? 100 : 1);
    });
    if (!ok) return null;
    var cm3 = s.v(x), one = cm3 / 1000;
    return { x: x, cm3: cm3, one: one, total: one * C.qty };
  }
  // 1 litre = 1.000 cm³; küçük hacimlerde 2, büyüklerde 1 ondalık
  function fmtL(n) { return nf(n, n < 100 ? 2 : 1) + ' litre'; }

  // Sonuçtan sonra yönlendirilecek toprak kategorileri
  function soilCats() {
    var cfg = CFG.calc || {};
    var names = ((cfg.recommend || {})[C.shape === 'bed' ? 'bed' : 'pot'] || []).map(fold);
    var picked = [];
    names.forEach(function (n) {
      var c = DATA.cats.filter(function (x) { return x.f === n; })[0];
      if (c && picked.indexOf(c) === -1) picked.push(c);
    });
    if (!picked.length) {
      var roots = (cfg.categories || ['Topraklar']).map(fold);
      DATA.cats.forEach(function (c) {
        if (c.p && CATS_BY_ID[c.p] && roots.indexOf(CATS_BY_ID[c.p].f) !== -1) picked.push(c);
      });
      picked.sort(function (a, b) { return b.k - a.k; });
    }
    return picked.slice(0, 6);
  }

  // En az litre (paket katına yuvarlanmış), sonra en az torba: 26 L → 30 L = 1 × 20 L + 1 × 10 L
  function packs(l) {
    var sizes = ((CFG.calc || {}).packs || [5, 10, 20, 40]).slice().sort(function (a, b) { return b - a; });
    var step = sizes[sizes.length - 1], total = Math.max(step, Math.ceil(l / step - 1e-9) * step), left = total, parts = [];
    sizes.forEach(function (z) { var n = Math.floor(left / z + 1e-9); if (n) { parts.push(n + ' × ' + z + ' L'); left -= n * z; } });
    return { total: total, text: total >= 1000 ? 'Toplu alımda size özel fiyat verelim.' : parts.join(' + ') + ' torba' };
  }
  function calcUpdate() {
    var out = $calc.querySelector('.out');
    if (!out) return;
    var r = need();
    $calc.querySelector('.s2').classList.toggle('done', !!r);
    $calc.querySelector('.s1').classList.add('done');
    if (!r) {
      $calc.querySelector('.s3').classList.remove('done');
      out.innerHTML = '<div class="wait">Ölçüleri girdiğinde gereken toprak miktarını burada göreceksin.</div>';
      return;
    }
    $calc.querySelector('.s3').classList.add('done');
    var extra = (CFG.calc || {}).extra != null ? +CFG.calc.extra : 10;
    // Sulandıkça oturma payı dahil gereken miktar; alım önerisi eldeki paket boyutlarına yuvarlanır
    var want = +(r.total * (1 + extra / 100)).toFixed(6), pk = packs(want), rec = pk.total;
    var big = SHAPES[C.shape].f.some(function (f) { return num(C.val[f[0]]) > 20; }) && C.unit[C.shape] === 'm';
    var html = (big ? '<div class="big">Metre seçiliyken 20\'den büyük değer girdiniz. Ölçüler santimetre mi? <a href="#" data-act="tocm">cm\'ye çevir</a></div>' : '') +
      '<div class="res"><div class="ic">' + I.bag + '</div><div><b>' + fmtL(want) + '</b><span>' +
      (C.qty > 1 ? C.qty + ' adet ' + SHAPES[C.shape].n.toLocaleLowerCase('tr') + ' için' : SHAPES[C.shape].n + ' için') +
      ' gereken toprak</span></div></div>' +
      '<div class="note">' + I.drop + '<span>Toprak sulandıkça yaklaşık %' + extra + ' oturur; bu pay hesaba <b>dahildir</b>' +
      (extra ? ' (net hacim ' + fmtL(r.total) + ')' : '') + '.</span></div>' +
      '<div class="rec">' + I.check + '<div><b>Önerilen alım: ' + nf(rec, 0) + ' litre</b><span>' + pk.text + '</span></div></div>';
    if (r.total >= 1000) {
      html += '<div class="big">Bu yaklaşık ' + (r.total / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' m³ ediyor. ' +
        (CFG.whatsapp ? '<a target="_blank" rel="noopener" href="' + esc(waHref('Merhaba, yaklaşık ' + rec + ' litre toprak almak istiyorum.')) + '">Toplu alım için bize yazın</a>'
          : CFG.phone ? 'Toplu alım için arayın: <a href="tel:' + esc(CFG.phone.replace(/[^\d+]/g, '')) + '">' + esc(CFG.phone) + '</a>' : 'Toplu alımlarda bizimle iletişime geçin.') + '</div>';
    }
    if (DATA) {
      var cats = soilCats();
      if (cats.length) {
        html += '<p class="go">Şimdi uygun toprağı seç' + (rec < 1000 ? '<small>Ürün sayfasında ' + esc(pk.text) + ' seçebilirsin.</small>' : '') + '</p>' +
          '<div class="gocats">' + cats.map(function (c, i) {
            return '<button type="button" data-act="catp" data-v="' + esc(c.id) + '" class="gc' + (i === 0 ? ' first' : '') + '">' +
              thumb(c.img, 180) + '<div class="tx"><b>' + esc(c.n) + '</b><small>' + c.k + ' ürün</small></div>' + I.arrow + '</button>';
          }).join('') + '</div>';
      }
    }
    out.innerHTML = html;
  }

  // ---------------- Ürün Bul butonu ----------------
  var HIDE_PATHS = /\/(checkout|cart|sepet|odeme|account\/login)(\/|$)/i;
  function fabEnabled() {
    if (ds.fab === 'off') return false;
    var f = CFG.fab || {};
    if (f.enabled === false) return false;
    return !HIDE_PATHS.test(location.pathname);
  }
  var fabShown = false;
  function updateFab() {
    if (!$fab) return;
    var hide = isOpen || !fabEnabled();
    $fab.classList.toggle('hide', hide);
    if (!hide && !fabShown) { fabShown = true; $fab.classList.add('in'); setTimeout(function () { $fab.classList.remove('in'); }, 700); }
    $fab.classList.toggle('still', (CFG.fab || {}).animate === false);
    if (!hide) fabSpace();
  }
  // Çerez uyarısı, WhatsApp balonu, alt "Sepete Ekle" çubuğu gibi altta sabit duran bir şey butonun yerini
  // kaplıyorsa buton onun üstüne çıkar; kaybolunca eski yerine döner. Ekranı kaplayan pencerede gizlenir.
  function fixedAncestor(el) {
    for (var n = el, i = 0; n && n.nodeType === 1 && n !== document.body && n !== document.documentElement && i < 10; n = n.parentElement, i++) {
      var ps = getComputedStyle(n).position;
      if (ps === 'fixed' || ps === 'sticky') return n;
    }
    return null;
  }
  function fabSpace() {
    if (!$fab || $fab.classList.contains('hide') || !document.elementsFromPoint) return;
    var W = window.innerWidth, H = window.innerHeight, left = $fab.classList.contains('left');
    var base = parseFloat(getComputedStyle($wrap).getPropertyValue('--fb')) || 20;
    var w = $fab.offsetWidth || 140, side = W < 760 ? 14 : 20;
    var x1 = left ? side : W - side - w, x2 = x1 + w;
    var ys = [H - base - 4, H - base - 26, H - base - 48];
    var xs = [x1 + 6, (x1 + x2) / 2, x2 - 6];
    var top = H, cover = false, seen = [];
    xs.forEach(function (x) {
      ys.forEach(function (y) {
        if (y < 0) return;
        document.elementsFromPoint(x, y).forEach(function (el) {
          if (isOurs(el) || el === document.body || el === document.documentElement || seen.indexOf(el) !== -1) return;
          seen.push(el);
          var fa = fixedAncestor(el);
          if (!fa || isOurs(fa)) return;
          var r = fa.getBoundingClientRect();
          if (r.height < 8 || r.width < 8 || r.bottom < H - base - 60) return;
          if (r.height > H * 0.6 && r.width > W * 0.6) { cover = true; return; }
          top = Math.min(top, r.top);
        });
      });
    });
    var lift = top < H ? Math.max(0, H - top + 12 - base) : 0;
    if (lift > H * 0.5) lift = 0;
    $fab.style.setProperty('--lift', Math.round(lift) + 'px');
    $fab.classList.toggle('blocked', cover);
  }
  function setupFab() {
    var lastY = window.pageYOffset, ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.pageYOffset;
        if (Math.abs(y - lastY) > 12) { $fab.classList.toggle('mini', y > lastY && y > 200); lastY = y; }
        ticking = false;
      });
    }, { passive: true });
    // ikas sayfalar arası geçişte sayfayı yenilemez; sepet/ödeme sayfasında butonu gizle
    ['pushState', 'replaceState'].forEach(function (m) {
      var orig = history[m];
      history[m] = function () { var r = orig.apply(this, arguments); setTimeout(updateFab, 0); return r; };
    });
    // Alt kısımdaki sabit öğeleri izle (çerez uyarısı geç gelebilir, onaylanınca kaybolur)
    var pend = false;
    var later = function () { if (pend) return; pend = true; setTimeout(function () { pend = false; fabSpace(); }, 250); };
    window.addEventListener('resize', later);
    window.addEventListener('scroll', later, { passive: true });
    document.addEventListener('click', function () { setTimeout(later, 400); }, true);
    // Çerez uyarısı / alt çubuk genelde body'ye doğrudan eklenir; tüm sayfa değişikliklerini izlemek (slider vb.) ağırdı
    if (window.MutationObserver) new MutationObserver(later).observe(document.body, { childList: true });
    setInterval(function () { if (!document.hidden && !isOpen) fabSpace(); }, 5000);
    updateFab();
  }

  // ---------------- Aç / kapat ----------------
  var prevOverflow = '';
  function open(initial, startTab) {
    build();
    if (!DATA) loadLite().then(function () { if (isOpen && !DATA) { renderIdle(); setTab(tab); } });
    if (PREP_NOW) { var go = PREP_NOW; PREP_NOW = null; go(); } // veri inmiş, boşta hazırlanmayı bekliyorsa beklemeden hazırla
    if (!isOpen) {
      isOpen = true;
      view = null;
      VSTACK = [];
      setTab(startTab || 'home');
      $ov.classList.add('on');
      updateFab();
      prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      hookNextPop();
      try { history.pushState({ urunArama: 1 }, ''); pushed = true; } catch (e) {}
    }
    if (typeof initial === 'string') $q.value = initial;
    if (tab !== 'calc') $q.focus();
    shown = PAGE;
    render();
    renderIdle();
    load().then(function () {
      renderIdle(); render(); if (tab === 'calc') calcUpdate();
    }, function () {
      $home.innerHTML = '<div class="empty"><b>Arama şu an yüklenemedi</b><p>Lütfen sayfayı yenileyip tekrar deneyin.</p></div>';
    });
  }

  function close(fromHistory) {
    if (!isOpen) return;
    isOpen = false;
    $ov.classList.remove('on');
    document.documentElement.style.overflow = prevOverflow;
    $q.blur();
    updateFab();
    if (pushed && fromHistory !== true) { pushed = false; try { history.back(); } catch (e) {} }
    pushed = false;
  }

  window.addEventListener('popstate', function () {
    if (isOpen) { pushed = false; close(true); }
    updateFab();
    // Panelden hızlı geçiş: geçmiş kaydı geri alındı, şimdi git. Bir sonraki adımda gidilir ki Next.js aynı geri
    // hareketini (sırası bizden sonra gelse bile) PENDING_NAV dolu görüp yok saysın
    if (PENDING_NAV) { var go = PENDING_NAV; setTimeout(function () { if (PENDING_NAV === go) { PENDING_NAV = null; go(); } }, 0); }
  });

  // Sitedeki arama kutularını yakala
  function isOurs(el) { return host && (el === host || host.contains(el)); }
  function matches(el, s) { try { return s && el && el.matches && el.matches(s); } catch (e) { return false; } }

  // Sitenin arama kutusu: odak/dokunma olaylarını ikas'a hiç iletme (yoksa ikas kendi aramasını açar)
  // Arama kutusu mu? type=search, name=q/s ya da yer tutucusu "ara/arama/aradığınız/search" kelimesiyle başlayan bir kelime içeriyorsa
  function isSearchInput(el) {
    if (!el || !matches(el, SELECTOR)) return false;
    if (ds.selector) return true;
    if (el.type === 'search' || el.name === 'q' || el.name === 's') return true;
    // ara, arayın, arama, aramak, aramıştınız, aradığınız, aranan, search… ("araba", "aralık", "parola" hariç)
    return words(fold(el.getAttribute('placeholder') || '')).some(function (w) { return /^(ara|aray[a-z]*|aram[a-z]*|arad[a-z]*|aran[a-z]*|search[a-z]*)$/.test(w); });
  }
  function siteInput(el) { return el && !isOurs(el) && isSearchInput(el) && !(el.ownerDocument && el.ownerDocument !== document); }
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (!siteInput(t)) return;
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    var v = t.value;
    t.blur();
    // Bir butona basıldıktan hemen sonra ikas'ın panelindeki kutu odaklandıysa: paneli kapat, butonu öğren
    if (lastTap.el !== t && tapTrusted() && (lastTap.pre || []).indexOf(t) === -1) { var tp = lastTap.el; lastTap = { el: null, t: 0 }; closeNative(t, tp); learn(tp); }
    open(v);
  }, true);

  // Sitenin kendi arama butonuna (büyüteç vb.) basılınca ikas'ın eski araması açılmadan bizimki açılsın.
  // data-trigger / config.json "triggers" ile seçici verilebilir; verilmezse "search"/"ara" içeren
  // buton ve bağlantılar otomatik tanınır (data-auto="off" ile kapatılır).
  var TRIGGER_RE = /(^|[^a-z])(search|arama|ara)([^a-z]|$)/;  // attrs() katlanmış metin; "parola" gibi içinde geçenler eşleşmez
  function attrs(n) {
    var c = n.getAttribute('class') || '';
    return fold([n.getAttribute('aria-label'), n.getAttribute('title'), n.id, c, n.getAttribute('data-testid'), n.getAttribute('name')].join(' '));
  }
  function triggerOf(el) {
    if (!el || !el.closest || isOurs(el)) return null;
    var sel = TRIGGER || (CFG.triggers || '');
    if (sel) { try { var t = el.closest(sel); if (t) return t; } catch (e) {} }
    var ln = learnedOf(el);
    if (ln) return ln;
    if (ds.auto === 'off' || CFG.autoTrigger === false) return null;
    var n = el.closest('a,button,[role="button"]');
    if (n) {
      var path = (n.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, '');
      if (/^\/(search|arama)([?\/#]|$)/i.test(path) && !/[?&](s|q)=./.test(path)) return n;
      if (isPageLink(n)) return null;
      return TRIGGER_RE.test(attrs(n)) && !n.closest('form') ? n : null;
    }
    // İkon sarmalayıcı div/span (küçük ve içinde ikon olan)
    if (isPageLink(el)) return null;
    n = el.closest('[class*="search" i],[id*="search" i],[aria-label*="ara" i]');
    if (!n || /^(input|textarea|form|body|html)$/i.test(n.tagName) || n.querySelector('input,textarea')) return null;
    var r = n.getBoundingClientRect();
    return r.width <= 160 && r.height <= 100 && n.querySelector('svg,img,i') && TRIGGER_RE.test(attrs(n)) ? n : null;
  }
  function stopAll(e) { e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
  ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { if (triggerOf(e.target) || siteInput(e.target)) stopAll(e); }, true);
    // Menü düğmesi: pencere seviyesinde yakala (sitenin hiçbir dinleyicisi dokunuşu görmesin)
    window.addEventListener(ev, function (e) { if (menuOf(e.target)) stopAll(e); }, true);
  });
  window.addEventListener('click', function (e) {
    if (!menuOf(e.target)) return;
    e.preventDefault(); stopAll(e); openMenu();
  }, true);
  var lastTap = { el: null, t: 0, path: '' };
  document.addEventListener('click', function (e) {
    if (siteInput(e.target)) { stopAll(e); open(e.target.value); return; }
    var t = triggerOf(e.target);
    if (!t) {
      if (!isOurs(e.target) && !isOpen) {
        // Menü çekmecesi kontrolü sadece telefonda ve başlık bölgesine dokunulunca (her dokunuşta sayfayı taramamak için)
        var hdr = false;
        try { hdr = replaceMenuOn() && e.target.getBoundingClientRect().top < 160; } catch (x) {}
        lastTap = { el: e.target, t: Date.now(), path: location.pathname, pre: visibleSearchInputs(), preMenu: hdr ? menuDrawers() : [] };
        [150, 400, 800].forEach(function (ms) { setTimeout(checkNewSearch, ms); if (hdr) setTimeout(checkMenuDrawer, ms); });
      }
      return;
    }
    e.preventDefault();
    stopAll(e);
    open();
  }, true);

  // ---- Telefonda sitenin menüsü (☰) yerine bizim panel ----
  // config.json > replaceMenu (varsayılan açık), menuTrigger: menü düğmesinin CSS seçicisi (#ua-debug çıktısından).
  // Seçici verilmezse: başlıktaki "menu/hamburger/drawer…" adlı düğme tanınır; o da olmazsa ikas menüsü açıldığı
  // an kapatılıp bizimki açılır ve düğme hatırlanır (bir dahaki basışta ikas menüsü hiç açılmaz).
  var MENU_KEY = 'ua-menu', menuLearned = [];
  try { menuLearned = JSON.parse(localStorage.getItem(MENU_KEY) || '[]') || []; } catch (e) {}
  var MENU_RE = /(^|[^a-z])(menu|menü|hamburger|burger|drawer|offcanvas|off-canvas|nav-?toggle|navbar-toggler|mobile-?nav|mobile-?menu|sidebar-?toggle|bars)([^a-z]|$)/;
  var NOT_MENU_RE = /(search|arama|cart|sepet|basket|bag|account|hesap|user|uye|login|giris|favori|wish|close|kapat|back|geri|prev|return|arrow|ok-|chevron|share|paylas|filter|filtre|sort|sirala)/;
  // Sadece telefon/tablet: dar ekran VE dokunmatik (masaüstünde pencere daraltılsa bile ikas menüsüne dokunulmaz)
  function isTouchPhone() {
    var coarse = false;
    try { coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches; } catch (e) {}
    return coarse || /Android|iPhone|iPod|Mobi/i.test(navigator.userAgent || '');
  }
  function replaceMenuOn() { return CFG.replaceMenu !== false && ds.menu !== 'off' && window.innerWidth < 760 && isTouchPhone(); }
  // ☰ simgesi: 3 çizgi/dikdörtgen ya da 3 ayrı yatay çizgili path
  function burgerIcon(b) {
    var svg = b.querySelector('svg');
    if (!svg) return false;
    if (svg.querySelectorAll('line,rect').length === 3) return true;
    var d = [].map.call(svg.querySelectorAll('path'), function (x) { return x.getAttribute('d') || ''; }).join(' ');
    return (d.match(/[Mm]/g) || []).length >= 3 && /[hH]|[Ll]\s*[\d.]+[\s,]+[\d.]+/.test(d) && !/[aAcCqQ]/.test(d);
  }
  function menuOf(el) {
    if (!el || !el.closest || isOurs(el) || !replaceMenuOn()) return null;
    var sel = CFG.menuTrigger || ds.menuTrigger;
    if (sel) { try { var m = el.closest(sel); if (m) return m; } catch (e) {} }
    for (var n = el, i = 0; n && n.nodeType === 1 && i < 5; n = n.parentElement, i++) if (menuLearned.indexOf(sig(n)) !== -1) return n;
    var b = el.closest('button,a,[role="button"],label,[onclick]'), plain = false;
    if (!b) {
      // Düğme olmayan tıklanabilir kutu: ☰ simgesinin hemen kapsayıcısı
      var sv = el.closest('svg');
      b = sv ? sv.parentElement : el.closest('div,span,i');
      plain = true;
    }
    if (!b || b === document.body || isPageLink(b) || b.closest('form')) return null;
    var r = b.getBoundingClientRect();
    if (r.top > 140 || r.width > 120 || r.height > 120) return null; // başlıktaki küçük düğme
    // Düğmenin ve içindeki simgelerin adları (ör. <i class="icon-menu">, <svg class="bars">)
    var a = attrs(b) + ' ' + fold(b.textContent || '') + ' ' + [].slice.call(b.querySelectorAll('[class],[aria-label]'), 0, 6).map(attrs).join(' ');
    if (NOT_MENU_RE.test(a)) return null;
    if (MENU_RE.test(a) || burgerIcon(b)) return b;
    if (plain) return null; // düz kutuda sadece ad ya da ☰ simgesiyle karar ver
    // Başlığın sol köşesinde yazısız tek simgeli düğme (ikas temalarında menü düğmesi burada)
    var txt = (b.textContent || '').replace(/\s+/g, '');
    if (!txt && b.querySelector('svg,img,i') && r.left < window.innerWidth * 0.25 && r.width <= 64 && r.height <= 64 && !triggerOf(b) &&
      (b.closest('header,nav,[class*="header" i],[id*="header" i]') || fixedAncestor(b))) return b;
    return null;
  }
  // Sitenin açık menü çekmecesi: ana kategori adlarını taşıyan ≥3 bağlantılı, ekranı kaplayan bir kutu
  function menuDrawers() {
    if (!DATA || !replaceMenuOn()) return [];
    var names = {}; topCats().forEach(function (c) { names[c.f] = 1; });
    var boxes = [];
    [].forEach.call(document.querySelectorAll('a,button,li,summary,[role="menuitem"]'), function (el) {
      var tx = el.textContent || '';
      if (tx.length > 40 || el.children.length > 3 || isOurs(el) || !names[fold(tx.trim())] || !visible(el)) return;
      var box = fixedAncestor(el);
      if (!box || isOurs(box)) return;
      var r = box.getBoundingClientRect();
      if (r.width < window.innerWidth * 0.6 || r.height < window.innerHeight * 0.5) return;
      box.__uaHits = (boxes.indexOf(box) === -1 ? 0 : box.__uaHits) + 1;
      if (boxes.indexOf(box) === -1) boxes.push(box);
    });
    return boxes.filter(function (b) { return b.__uaHits >= 3; });
  }
  function closeDrawer(box) {
    var btns = box.querySelectorAll('button,[role="button"],a');
    for (var j = 0; j < btns.length; j++) {
      var b = btns[j], a = fold((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.getAttribute('class') || '') + ' ' + (b.textContent || '')).trim();
      if (/(^|[\s_-])(kapat|close|iptal|vazgec)([\s_-]|$)|^[x×✕✖]$/.test(a)) { b.click(); break; }
    }
    try { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); } catch (e) {}
    setTimeout(function () { if (visible(box)) box.style.setProperty('display', 'none', 'important'); }, 200);
  }
  function learnMenu(el) {
    var n = el && el.closest && (el.closest('a,button,[role="button"]') || el);
    if (!n || n === document.body || isPageLink(n)) return;
    var sg = sig(n);
    if (menuLearned.indexOf(sg) !== -1) return;
    menuLearned = [sg].concat(menuLearned).slice(0, 3);
    try { localStorage.setItem(MENU_KEY, JSON.stringify(menuLearned)); } catch (e) {}
  }
  function checkMenuDrawer() {
    if (isOpen || !tapTrusted() || !replaceMenuOn()) return;
    var pre = lastTap.preMenu || [];
    var fresh = menuDrawers().filter(function (b) { return pre.indexOf(b) === -1; });
    if (!fresh.length) return;
    var tp = lastTap.el;
    lastTap = { el: null, t: 0 };
    closeDrawer(fresh[0]);
    learnMenu(tp);
    openMenu();
  }
  // Menü düğmesi: panel "Ürün Bul" ile birebir aynı açılır (Tüm kategoriler kapalı)
  function openMenu() {
    track('menu', 'open');
    catOpen = false;
    open('', 'home');
  }
  // Emniyet: ikas'ın arama paneli yine de açılırsa (tanımadığımız bir butondan) onu kapat, bizimkini aç
  // ve o butonu hatırla; sonraki basışlarda ikas'ınki hiç açılmaz.
  var LEARN_KEY = 'ua-trig2', learned = [];
  try { localStorage.removeItem('ua-trig'); } catch (e) {} // eski sürümün yanlış öğrendiklerini sil
  function isPageLink(el) {
    var a = el && el.closest && el.closest('a[href]');
    if (!a) return false;
    var h = (a.getAttribute('href') || '').trim();
    return !!h && h.charAt(0) !== '#' && !/^javascript:/i.test(h);
  }
  function tapTrusted() {
    return lastTap.el && Date.now() - lastTap.t < 1500 && lastTap.path === location.pathname && !isPageLink(lastTap.el);
  }
  try { learned = JSON.parse(localStorage.getItem(LEARN_KEY) || '[]') || []; } catch (e) {}
  function sig(n) { return n.tagName + '|' + (n.getAttribute('class') || '') + '|' + (n.getAttribute('aria-label') || ''); }
  function learnedOf(el) {
    for (var n = el, i = 0; n && n.nodeType === 1 && i < 5; n = n.parentElement, i++) if (learned.indexOf(sig(n)) !== -1) return n;
    return null;
  }
  function learn(el) {
    if (isPageLink(el)) return;
    var n = el.closest && (el.closest('a,button,[role="button"]') || el);
    if (!n || n === document.body || n.querySelector('input')) return;
    var sg = sig(n);
    if (learned.indexOf(sg) !== -1) return;
    learned = [sg].concat(learned).slice(0, 5);
    try { localStorage.setItem(LEARN_KEY, JSON.stringify(learned)); } catch (e) {}
  }
  function closeNative(input, tapped) {
    // En yakın sabit konumlu kapsayıcıyı bul (ikas'ın arama paneli)
    var box = input, cand = null;
    for (var i = 0; box && box !== document.body && i < 12; box = box.parentElement, i++) {
      var ps = getComputedStyle(box).position;
      if (ps === 'fixed' || ps === 'absolute') cand = box;
    }
    // Tıklanan buton da aynı kapsayıcıdaysa bu bir panel değil sitenin başlığıdır; dokunma
    if (cand && tapped && cand.contains(tapped)) cand = null;
    if (!cand) return false;
    var scope = cand;
    var btns = scope.querySelectorAll('button,[role="button"],a');
    for (var j = 0; j < btns.length; j++) {
      var b = btns[j], a = fold((b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '') + ' ' + (b.textContent || '')).trim();
      if (/(^|\s)(kapat|close|iptal|vazgec)(\s|$)|^[x×✕✖]$/.test(a)) { b.click(); break; }
    }
    try { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })); } catch (e) {}
    setTimeout(function () { if (cand && visible(input)) cand.style.setProperty('display', 'none', 'important'); }, 150);
    rememberOverlay(cand);
    return true;
  }
  // ikas'ın arama penceresi: gördüğümüzü kaydet (#ua-debug ile görülür, config.json'a eklenip herkese uygulanır)
  var OVL_KEY = 'ua-ovl', ovl = [];
  try { ovl = JSON.parse(localStorage.getItem(OVL_KEY) || '[]') || []; } catch (e) {}
  function rememberOverlay(n) {
    var cls = (n.getAttribute('class') || '').split(/\s+/).filter(function (c) { return /^[a-z_-][\w-]*$/i.test(c); });
    var sl = n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (cls.length ? '.' + cls.join('.') : '');
    if (ovl.indexOf(sl) !== -1) return;
    ovl = [sl].concat(ovl).slice(0, 3);
    try { localStorage.setItem(OVL_KEY, JSON.stringify(ovl)); } catch (e) {}
  }
  // config.json > hideNative: ikas'ın arama penceresinin seçicisi; tüm ziyaretçilerde hiç görünmez
  function hideNative() {
    if (!CFG.hideNative || document.getElementById('ua-hide-native')) return;
    var st = document.createElement('style');
    st.id = 'ua-hide-native';
    st.textContent = CFG.hideNative + '{display:none!important}';
    (document.head || document.documentElement).appendChild(st);
  }
  // Arama formu gönderilirse (Enter / ara butonu) ikas'ın sonuç sayfasına gitme, bizimkini aç
  document.addEventListener('submit', function (e) {
    var f = e.target, inp = f && f.querySelector && [].filter.call(f.querySelectorAll(SELECTOR), function (x) { return !isOurs(x) && isSearchInput(x); })[0];
    if (!inp || isOurs(f)) return;
    e.preventDefault(); stopAll(e);
    open(inp.value || '');
  }, true);
  function visibleSearchInputs() {
    return [].filter.call(document.querySelectorAll(SELECTOR), function (el) { return !isOurs(el) && isSearchInput(el) && visible(el); });
  }
  // İkas'ın arama paneli açıldı: onu kapat, açan butonu öğren, bizimkini aç
  function handleNative(inp) {
    var tapped = lastTap.el;
    lastTap = { el: null, t: 0 };
    closeNative(inp, tapped);
    learn(tapped);
    open(inp.value || '');
  }
  function checkNewSearch() {
    if (isOpen || !tapTrusted()) return;
    var pre = lastTap.pre || [];
    var fresh = visibleSearchInputs().filter(function (el) { return pre.indexOf(el) === -1; });
    if (fresh.length) handleNative(fresh[0]);
  }
  if (window.MutationObserver) {
    new MutationObserver(function (muts) {
      if (Date.now() - lastTap.t > 1500 || !lastTap.el) return;
      for (var i = 0; i < muts.length; i++) {
        for (var j = 0; j < muts[i].addedNodes.length; j++) {
          var n = muts[i].addedNodes[j];
          if (n.nodeType !== 1 || isOurs(n)) continue;
          var inp = isSearchInput(n) ? n : [].filter.call(n.querySelectorAll ? n.querySelectorAll(SELECTOR) : [], isSearchInput)[0];
          if (!inp || isOurs(inp) || !visible(inp)) continue;
          if (!tapTrusted() || (lastTap.pre || []).indexOf(inp) !== -1) return;
          handleNative(inp);
          return;
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // ---------------- Masaüstü ana menü ----------------
  // Sadece masaüstünde (geniş ekran + fare): ikas'ın üst menüsündeki kategori bağlantıları (Gübreler, Topraklar …)
  // bulunur, öğeleri gizlenip yerine düzenli bir çubuk konur. Üzerine gelince geniş bir panel açılır:
  // alt kategoriler sütunlar halinde, kategorinin çok satanları ve "Tümünü gör". Menü bulunamazsa hiçbir şeye
  // dokunulmaz; telefon ve tablet menüsü etkilenmez. Kapatmak: config.json > "desktopMenu": false
  //
  // ikas'tan önce devreye girmesi için: script çalışır çalışmaz ikas menüsü görünmez yapılır (yeri korunur,
  // sayfa kaymaz). Menünün küçük bir özeti tarayıcıda saklanır (ua-dnav), ürün verisi beklenmeden kurulur.
  // ikas sayfası React ile çalışır; React menüyü "canlandırmadan" önce içine öğe eklemek sayfanın yeniden
  // çizilmesine yol açacağı için bizim çubuk menü canlandığı an eklenir. 6 sn içinde kurulamazsa ikas menüsü geri gelir.
  var DN = null, DM = null, DM_KEY = 'ua-dnav-v1', PRE = null, PRE_T = 0, DM_WAIT = false, HYD = false;
  function wideScreen() {
    return window.innerWidth >= 1024 && !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  }
  function dmenuOn() { return !!DM && !DM.off && ds.dmenu !== 'off' && wideScreen(); }
  function slugOf(href) {
    try {
      var u = new URL(href, location.href);
      if (u.origin !== location.origin) return null;
      return decodeURIComponent(u.pathname).replace(/\/+$/, '').split('/').pop().toLowerCase();
    } catch (e) { return null; }
  }
  // Kategorinin öne çıkan 3 ürünü: config.json > desktopMenu.picks["Kategori adı"] (elle onaylanan) önce,
  // sonra ziyaretçi eğilimi + gerçek satışlara göre (p.h), veri yoksa çok satan/mağaza markası
  function dmProducts(c) {
    if (!DATA) return ((LITE || {}).dmp || {})[c.id] || [];
    var set = {}, picks = ((dmCfgObj().picks || {})[c.n] || []).map(function (s) { return BY_SLUG[s]; })
      .filter(function (p) { return p && p.st && p.img; });
    (function add(id) { set[id] = 1; (KIDS[id] || []).forEach(function (k) { add(k.id); }); })(c.id);
    var rest = DATA.items.filter(function (p) { return p.st && p.img && p.r >= 0 && picks.indexOf(p) === -1 && p.c.some(function (x) { return set[x]; }); })
      .sort(function (a, b) { return (b.h || 0) - (a.h || 0) || (b.best ? 3 : 0) + b.r - ((a.best ? 3 : 0) + a.r); });
    return picks.concat(rest).slice(0, 3);
  }
  function dmCfgObj() { return CFG.desktopMenu && typeof CFG.desktopMenu === 'object' ? CFG.desktopMenu : {}; }
  // Menü özeti (ürün verisinden; tarayıcıda saklanır): kategoriler, alt kategoriler, çok satanlar
  function dmModel() {
    var dc = CFG.desktopMenu, o = dmCfgObj(), hidden = {}, up = {};
    (o.hide || []).forEach(function (n) { hidden[fold(n)] = 1; });
    var keep = function (c) { return c.k > 0 && !hidden[c.f]; };
    SRC().cats.forEach(function (c) {
      var t = c;
      while (t.p && CATS_BY_ID[t.p]) t = CATS_BY_ID[t.p];
      up[c.s] = t.s;
    });
    // config.json > desktopMenu.items: çubukta hangi ana kategoriler hangi sırayla (ikas menüsünde olmasa da) gösterilsin
    var tops = topCats(), fixed = (o.items || []).map(fold);
    if (fixed.length) tops = fixed.map(function (f) { return tops.filter(function (c) { return c.f === f; })[0]; }).filter(Boolean);
    var cats = tops.filter(function (c) { return !hidden[c.f]; }).map(function (c) {
      return {
        n: c.n, l: (o.labels || {})[c.n] || c.n, s: c.s,
        k: (KIDS[c.id] || []).filter(keep).map(function (k) {
          return { n: k.n, s: k.s, k: (KIDS[k.id] || []).filter(keep).map(function (g) { return { n: g.n, s: g.s }; }) };
        }),
        p: o.products === false ? [] : dmProducts(c).map(function (p) {
          // menu.json'daki hazır seçimde fiyat (p) ve eski fiyat (o) zaten hesaplı gelir
          return DATA ? { n: p.n, s: p.s, i: imgSrc(p.img, 180), p: price(p), o: p.d != null && p.p > p.d ? p.p : 0 } : { n: p.n, s: p.s, i: imgSrc(p.img, 180), p: p.p, o: p.o };
        })
      };
    });
    return { v: 1, off: dc === false, sel: CFG.desktopNav || '', fixed: fixed.length > 0, cats: cats, up: up, ac: (CFG.colors || {}).accent || '' };
  }
  // Satırdaki boş alan: menünün solundaki (logo) ve sağındaki (ikonlar) öğeler arasında kalan genişlik
  function rowSpace(el) {
    var a = el, r = el.getBoundingClientRect();
    while (a.parentElement && a.parentElement !== document.body) {
      var sib = [].filter.call(a.parentElement.children, function (x) {
        if (x === a || x.id === 'ua-mega') return false;
        var q = x.getBoundingClientRect();
        return q.width > 0 && q.height > 0 && q.top < r.bottom && q.bottom > r.top;
      });
      if (sib.length) {
        var L = a.parentElement.getBoundingClientRect().left, R = a.parentElement.getBoundingClientRect().right;
        sib.forEach(function (x) {
          var q = x.getBoundingClientRect();
          if (q.right <= r.left + 2) L = Math.max(L, q.right); else if (q.left >= r.right - 2) R = Math.min(R, q.left);
        });
        return { w: R - L, l: L, row: a.parentElement };
      }
      a = a.parentElement;
    }
    return { w: r.width, l: r.left, row: el.parentElement };
  }
  // Ortak ata + güvenlik: logo, arama kutusu, sepet veya hesap içeren bir kapsayıcıya dokunma; sayfanın en üstünde
  // ya da sabit/yapışkan başlıkta olmalı (sayfa kaydırılmışken altbilgi menüsü seçilmesin)
  function navOf(links) {
    var nav = links[0].parentElement, y = window.pageYOffset || 0;
    while (nav && !links.every(function (a) { return nav.contains(a); })) nav = nav.parentElement;
    if (!nav || nav === document.body || nav === document.documentElement) return null;
    if (nav.querySelector('input,textarea,select,a[href*="cart"],a[href*="sepet"],a[href*="account"],a[href*="hesap"],a[href*="login"]')) return null;
    var nr = nav.getBoundingClientRect();
    if (nr.height > 120) return null;
    if (nr.top + y > 260) {
      for (var pe = nav; pe && pe !== document.body; pe = pe.parentElement) if (/fixed|sticky/.test(getComputedStyle(pe).position)) break;
      if (!pe || pe === document.body) return null;
    }
    return nav;
  }
  function findNav(M) {
    var tops = {};
    M.cats.forEach(function (c) { tops[c.s] = c; });
    var hits = [], seen = {}, as = [];
    if (M.sel) { var cn = document.querySelector(M.sel); if (cn) as = cn.querySelectorAll('a[href]'); }
    else as = document.querySelectorAll('a[href]');
    for (var i = 0; i < as.length; i++) {
      var a = as[i], s = slugOf(a.href);
      if (!s || !tops[s] || seen[s] || isOurs(a)) continue;
      var r = a.getBoundingClientRect();
      if (!r.width || !r.height || r.top > 260 || r.bottom < 0) continue;
      seen[s] = 1;
      hits.push({ a: a, c: tops[s], r: r });
    }
    if (hits.length < 3) return null;
    // Hepsi aynı satırda olmalı (yan menü/altbilgi değil)
    if (hits.some(function (h) { return Math.abs(h.r.top - hits[0].r.top) > 24; })) return null;
    var nav = navOf(hits.map(function (h) { return h.a; }));
    if (!nav) return null;
    // Kategori olmayan görünür bağlantılar (Blog, İletişim …) çubuğun sonunda korunur; "Anasayfa" atlanır (logo zaten oraya gider)
    var hrefs = {}, extra = [], ex = {};
    [].forEach.call(nav.querySelectorAll('a[href]'), function (a) {
      var s = slugOf(a.href);
      if (s == null) return;
      if (M.up[s]) { if (!hrefs[s]) hrefs[s] = a.href; return; }
      var r = a.getBoundingClientRect(), t = (a.textContent || '').replace(/\s+/g, ' ').trim();
      if (s && t && !ex[s] && r.width && Math.abs(r.top - hits[0].r.top) < 24) { ex[s] = 1; extra.push({ t: t, href: a.href }); }
    });
    var cats = M.fixed ? M.cats : M.cats.filter(function (c) { return seen[c.s]; });
    return { nav: nav, cats: cats, hrefs: hrefs, extra: extra, space: rowSpace(nav), w0: nav.getBoundingClientRect().width };
  }
  // İlk ziyarette (özet yokken) ikas menüsünü tahmin et: başlıktaki aynı satırda duran en az 4 kısa bağlantı.
  // Sadece görünmez yapılır; 6 sn içinde bizim menü kurulmazsa geri gelir.
  function guessNav() {
    var as = document.querySelectorAll('header a[href], nav a[href]'), rows = {}, best = null;
    for (var i = 0; i < as.length; i++) {
      var a = as[i], s = slugOf(a.href), t = (a.textContent || '').trim();
      if (!s || /\//.test(s) || t.length < 2 || t.length > 40) continue;
      var r = a.getBoundingClientRect();
      if (!r.width || !r.height || r.top > 220 || r.bottom < 0) continue;
      var k = Math.round(r.top / 8);
      (rows[k] = rows[k] || []).push(a);
    }
    Object.keys(rows).forEach(function (k) { if (rows[k].length >= 4 && (!best || rows[k].length > best.length)) best = rows[k]; });
    return best ? navOf(best) : null;
  }
  function dmStyle() {
    if (document.getElementById('ua-dnav-css')) return;
    var st = document.createElement('style');
    st.id = 'ua-dnav-css';
    st.textContent = '[data-ua-pre]>:not(.ua-dnav){visibility:hidden!important}' +
      '[data-ua-nav]>:not(.ua-dnav){display:none!important}[data-ua-nav]{overflow:visible!important}';
    (document.head || document.documentElement).appendChild(st);
  }
  function preHide(el) {
    dmStyle();
    if (PRE && PRE !== el) PRE.removeAttribute('data-ua-pre');
    PRE = el;
    el.setAttribute('data-ua-pre', '');
    clearTimeout(PRE_T);
    PRE_T = setTimeout(function () { if (!DN) clearPre(); }, 6000);
  }
  function clearPre() {
    clearTimeout(PRE_T);
    if (PRE) PRE.removeAttribute('data-ua-pre');
    PRE = null;
  }
  // React menüyü canlandırdı mı? (React değilse hemen)
  function hydrated(el) {
    if (HYD || !(window.__NEXT_DATA__ || document.getElementById('__NEXT_DATA__') || document.getElementById('__next'))) return true;
    var ks = Object.keys(el);
    for (var i = 0; i < ks.length; i++) if (/^__react(Fiber|InternalInstance|Props)\$/.test(ks[i])) return true;
    return false;
  }
  function whenHydrated(el, cb) {
    if (HYD || hydrated(el) && !document.getElementById('__next')) { HYD = true; return cb(); }
    var t0 = Date.now(), seen = 0;
    (function poll() {
      if (!el.isConnected || Date.now() - t0 > 8000) { HYD = true; return cb(); }
      // Canlandığı görüldükten sonra React'in işi bitirmesi için kısa bir süre daha bekle
      if (hydrated(el)) { if (!seen) seen = Date.now(); else if (Date.now() - seen > 120) { HYD = true; return cb(); } }
      setTimeout(poll, 40);
    })();
  }

  var DCSS = [
    ':host{all:initial;display:block;font-family:inherit}',
    '*{box-sizing:border-box;margin:0;padding:0;font-family:inherit}',
    'a{color:inherit;text-decoration:none}',
    '.bar{--ac:var(--uac,#d7372f);--ink:#1d2a23;display:flex;align-items:center;justify-content:center;gap:2px;height:100%;min-height:44px;white-space:nowrap;--fs:15px;--px:13px}',
    '.bar.s1{--fs:14px;--px:11px}.bar.s2{--fs:13.5px;--px:9px}.bar.s3{--fs:12.5px;--px:7px}',
    '.ti{position:relative;display:flex;align-items:center;gap:5px;height:44px;padding:0 var(--px);font-size:var(--fs);font-weight:650;color:var(--ink);letter-spacing:.1px;border-radius:10px;transition:color .15s,background .15s}',
    '.ti svg{width:13px;height:13px;transform:rotate(90deg);opacity:.55;transition:transform .2s,opacity .2s}',
    '.ti::after{content:"";position:absolute;left:var(--px);right:var(--px);bottom:5px;height:2.5px;border-radius:2px;background:var(--ac);transform:scaleX(0);transition:transform .2s}',
    '.ti:hover,.ti.op,.ti.on{color:var(--ac)}',
    '.ti:hover::after,.ti.op::after,.ti.on::after{transform:scaleX(1)}',
    '.ti.op svg{transform:rotate(-90deg);opacity:1}',
    '.ti:focus-visible{outline:2px solid var(--ac);outline-offset:-2px}',
    // Açılan panel
    '.bd{position:fixed;left:0;right:0;bottom:0;top:var(--t,80px);background:rgba(16,24,20,.22);opacity:0;pointer-events:none;transition:opacity .18s}',
    '.mg{position:fixed;left:0;right:0;top:var(--t,80px);background:#fff;border-top:1px solid #eceeed;box-shadow:0 18px 40px rgba(16,24,20,.16);opacity:0;transform:translateY(-6px);pointer-events:none;transition:opacity .16s,transform .16s;max-height:calc(100vh - var(--t,80px) - 24px);overflow-y:auto}',
    '.on .bd{opacity:1;pointer-events:auto}.on .mg{opacity:1;transform:none;pointer-events:auto}',
    '.in{--ac:var(--uac,#d7372f);--ink:#1d2a23;--mu:#6b756f;max-width:1240px;margin:0 auto;padding:26px 32px 30px;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:36px;color:var(--ink)}',
    '.in.nos{grid-template-columns:minmax(0,1fr)}',
    '.hd{display:flex;align-items:baseline;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #eceeed}',
    '.hd b{font-size:20px;font-weight:800}',
    '.hd a{margin-left:auto;font-size:13.5px;font-weight:700;color:var(--ac);display:flex;align-items:center;gap:4px}',
    '.hd a svg{width:14px;height:14px}.hd a:hover{text-decoration:underline}',
    '.cols{columns:3 190px;column-gap:28px}',
    '.grp{break-inside:avoid;padding:2px 0 14px}',
    '.g{display:block;font-size:14.5px;font-weight:750;line-height:1.3;padding:5px 0}',
    '.g:hover{color:var(--ac)}',
    '.s{display:block;font-size:13.5px;line-height:1.35;color:#4a554f;padding:4px 0 4px 12px;border-left:2px solid #eceeed}',
    '.s:hover{color:var(--ac);border-left-color:var(--ac)}',
    '.side{background:#f6f8f6;border-radius:16px;padding:16px;align-self:start}',
    '.side .h{font-size:12.5px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--mu);margin-bottom:8px}',
    '.pr{display:flex;align-items:center;gap:12px;padding:8px;margin:0 -8px;border-radius:12px}',
    '.pr:hover{background:#fff}',
    '.pr i{width:58px;height:58px;flex:none;border-radius:12px;background:#fff;border:1px solid #eceeed;display:grid;place-items:center;overflow:hidden}',
    '.pr img{width:100%;height:100%;object-fit:contain;padding:3px}',
    '.pr span{min-width:0;flex:1}',
    '.pr em{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-style:normal;font-size:13px;font-weight:600;line-height:1.3}',
    '.pr b{display:block;margin-top:3px;font-size:14px;font-weight:800;color:var(--ac)}',
    '.pr s{font-size:12px;font-weight:500;color:var(--mu);margin-left:6px}',
    '.all{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:10px;height:40px;border-radius:12px;background:var(--ac);color:#fff;font-size:13.5px;font-weight:700}',
    '.all:hover{filter:brightness(1.07)}.all svg{width:14px;height:14px}'
  ].join('');

  function dmCat(s) { for (var i = 0; DN && i < DN.cats.length; i++) if (DN.cats[i].s === s) return DN.cats[i]; return null; }
  function dmHref(s) { return (DN && DN.hrefs[s]) || url(s); }
  function megaHtml(c) {
    var all = '<a href="' + esc(dmHref(c.s)) + '" data-n="' + esc(c.n) + '">Tümünü gör' + I.right + '</a>';
    var cols = c.k.map(function (k) {
      return '<div class="grp"><a class="g" href="' + esc(dmHref(k.s)) + '" data-n="' + esc(k.n) + '">' + esc(k.n) + '</a>' +
        k.k.map(function (g) { return '<a class="s" href="' + esc(dmHref(g.s)) + '" data-n="' + esc(g.n) + '">' + esc(g.n) + '</a>'; }).join('') + '</div>';
    }).join('');
    var side = c.p.length ? '<aside class="side"><div class="h">Çok satanlar</div>' + c.p.map(function (p) {
      return '<a class="pr" href="' + esc(url(p.s)) + '" data-n="' + esc(p.n) + '"><i>' + (p.i ? '<img loading="lazy" alt="" src="' + esc(p.i) + '">' : I.sprout) + '</i>' +
        '<span><em>' + esc(p.n) + '</em><b>' + tl(p.p) + (p.o ? '<s>' + tl(p.o) + '</s>' : '') + '</b></span></a>';
    }).join('') + '<a class="all" href="' + esc(dmHref(c.s)) + '" data-n="' + esc(c.n) + '">Tüm ' + esc(c.n) + I.right + '</a></aside>' : '';
    return '<div class="in' + (side ? '' : ' nos') + '"><div><div class="hd"><b>' + esc(c.n) + '</b>' + all + '</div>' +
      (cols ? '<div class="cols">' + cols + '</div>' : '') + '</div>' + side + '</div>';
  }

  function dmFit() {
    var bar = DN.bar, cls = ['', 's1', 's2', 's3'];
    for (var i = 0; i < cls.length; i++) {
      bar.className = 'bar ' + cls[i];
      if (bar.scrollWidth <= DN.host.clientWidth + 1) return;
    }
  }
  function dmTop() {
    var r = (DN.row && DN.row.closest && DN.row.closest('header')) || DN.row || DN.host;
    var b = Math.max(r.getBoundingClientRect().bottom, DN.host.getBoundingClientRect().bottom);
    DN.mwrap.style.setProperty('--t', Math.max(0, Math.round(b)) + 'px');
  }
  function dmOpen(s) {
    clearTimeout(DN.tc);
    var c = dmCat(s);
    if (!c || !c.k.length) return dmClose();
    if (DN.cur !== s) {
      DN.cur = s;
      DN.mg.innerHTML = megaHtml(c);
      DN.mg.scrollTop = 0;
    }
    [].forEach.call(DN.bar.querySelectorAll('.ti'), function (a) { a.classList.toggle('op', a.getAttribute('data-s') === s); });
    dmTop();
    DN.mwrap.classList.add('on');
  }
  // Sayfa yenilenmeden geçildiğinde çubukta bulunulan kategoriyi güncelle
  function dmActive() {
    if (!DN || !DM) return;
    var act = DM.up[slugOf(location.href)] || '';
    [].forEach.call(DN.bar.querySelectorAll('.ti'), function (a) { a.classList.toggle('on', !!act && a.getAttribute('data-s') === act); });
  }
  function dmClose() {
    clearTimeout(DN.to);
    clearTimeout(DN.tc);
    DN.cur = null;
    DN.mwrap.classList.remove('on');
    [].forEach.call(DN.bar.querySelectorAll('.ti.op'), function (a) { a.classList.remove('op'); });
  }
  function dmLater() { clearTimeout(DN.to); clearTimeout(DN.tc); DN.tc = setTimeout(dmClose, 220); }

  function unmountNav() {
    if (!DN) return;
    try { dmClose(); } catch (e) {}
    DN.nav.removeAttribute('data-ua-nav');
    if (DN.host.parentNode) DN.host.parentNode.removeChild(DN.host);
    if (DN.mhost.parentNode) DN.mhost.parentNode.removeChild(DN.mhost);
    DN = null;
  }
  function mountNav() {
    if (DN || DM_WAIT || !dmenuOn()) return;
    var f;
    try { f = findNav(DM); } catch (e) { f = null; }
    if (!f) return;
    preHide(f.nav);
    DM_WAIT = true;
    var ghost = null;
    if (!HYD) try { ghost = dmGhost(f); } catch (e) {}
    whenHydrated(f.nav, function () {
      DM_WAIT = false;
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      if (DN || !dmenuOn()) return;
      var g;
      try { g = f.nav.isConnected ? findNav(DM) : null; } catch (e) { g = null; }
      if (g) buildNav(g); else clearPre();
    });
  }
  function barHtml(f) {
    var active = DM.up[slugOf(location.href)] || '';
    return '<style>' + DCSS + '</style><nav class="bar" aria-label="Kategoriler">' + f.cats.map(function (c) {
      var has = c.k.length > 0;
      return '<a class="ti' + (c.s === active ? ' on' : '') + '" href="' + esc(f.hrefs[c.s] || url(c.s)) + '" data-s="' + esc(c.s) + '" data-n="' + esc(c.n) + '"' +
        (has ? ' aria-haspopup="true"' : '') + '>' + esc(c.l) + (has ? I.right : '') + '</a>';
    }).join('') + f.extra.map(function (x) {
      return '<a class="ti" href="' + esc(x.href) + '" data-n="' + esc(x.t) + '">' + esc(x.t) + '</a>';
    }).join('') + '</nav>';
  }
  // ikas sayfayı canlandırana kadar menünün yeri boş kalmasın: aynı çubuğun geçici bir kopyası tam üstünde durur
  // (sayfanın dışında, React'in alanına dokunmadan); asıl menü yerleşince kaldırılır
  function dmGhost(f) {
    var r = f.nav.getBoundingClientRect(), w = Math.max(f.w0, f.space.w - 24), fixed = false;
    for (var pe = f.nav; pe && pe !== document.body; pe = pe.parentElement) if (getComputedStyle(pe).position === 'fixed') { fixed = true; break; }
    var left = f.w0 >= f.space.w - 24 ? r.left : f.space.l + 12;
    var g = document.createElement('div');
    g.id = 'ua-dnav-ghost';
    g.style.cssText = 'position:' + (fixed ? 'fixed' : 'absolute') + ';z-index:2147481000;top:' + (r.top + (fixed ? 0 : window.pageYOffset)) + 'px;left:' +
      (left + (fixed ? 0 : window.pageXOffset)) + 'px;width:' + w + 'px;height:' + Math.max(44, r.height) + 'px;font-family:' + getComputedStyle(f.nav).fontFamily;
    if (DM && DM.ac) g.style.setProperty('--uac', DM.ac);
    var gr = g.attachShadow ? g.attachShadow({ mode: 'open' }) : g;
    gr.innerHTML = barHtml(f);
    document.body.appendChild(g);
    var bar = gr.querySelector('.bar'), cls = ['', 's1', 's2', 's3'];
    for (var i = 0; i < cls.length; i++) { bar.className = 'bar ' + cls[i]; if (bar.scrollWidth <= w + 1) break; }
    // Hizalama: kopyayı ikas menüsünün dikey ortasına koy; sayfa yüklenirken düzen kayarsa (görsel, yazı tipi) takip et
    var place = function () {
      var q = f.nav.getBoundingClientRect();
      g.style.top = (q.top + (fixed ? 0 : window.pageYOffset) + (q.height - g.offsetHeight) / 2) + 'px';
      if (left === r.left) g.style.left = (q.left + (fixed ? 0 : window.pageXOffset)) + 'px';
    };
    place();
    var k = 0;
    (function follow() { if (g.isConnected && f.nav.isConnected && ++k < 90) { place(); requestAnimationFrame(follow); } })();
    return g;
  }
  function buildNav(f) {
    var font = getComputedStyle(f.nav).fontFamily;
    var host = document.createElement('div');
    host.className = 'ua-dnav';
    host.style.cssText = 'display:block;flex:1 1 auto;min-width:0;list-style:none;align-self:stretch;width:' + Math.max(f.w0, f.space.w - 24) + 'px;max-width:100%;font-family:' + font;
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    root.innerHTML = barHtml(f);
    var mhost = document.createElement('div');
    mhost.id = 'ua-mega';
    mhost.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147482000;font-family:' + font;
    // Vurgu rengi (config > colors.accent; ikinci sitenin paleti) gölge DOM'a CSS değişkeniyle geçer
    if (DM && DM.ac) { host.style.setProperty('--uac', DM.ac); mhost.style.setProperty('--uac', DM.ac); }
    var mroot = mhost.attachShadow ? mhost.attachShadow({ mode: 'open' }) : mhost;
    mroot.innerHTML = '<style>' + DCSS + '</style><div class="mw"><div class="bd"></div><div class="mg" role="region" aria-label="Alt kategoriler"></div></div>';
    if (PRE && PRE !== f.nav) clearPre();
    f.nav.setAttribute('data-ua-nav', '');
    f.nav.appendChild(host);
    clearPre();
    document.body.appendChild(mhost);
    DN = { nav: f.nav, row: f.space.row, hrefs: f.hrefs, cats: f.cats, host: host, mhost: mhost, bar: root.querySelector('.bar'),
      mwrap: mroot.querySelector('.mw'), mg: mroot.querySelector('.mg'), cur: null };
    dmFit();
    var bar = DN.bar;
    bar.addEventListener('mouseover', function (e) {
      var a = e.target.closest && e.target.closest('.ti');
      if (!a) return;
      var s = a.getAttribute('data-s'), c = s && dmCat(s);
      clearTimeout(DN.to); clearTimeout(DN.tc);
      if (!c || !c.k.length) { DN.tc = setTimeout(dmClose, 120); return; }
      // Panel zaten açıksa hemen geç; değilse fare yanlışlıkla üzerinden geçerken açılmasın
      if (DN.cur) dmOpen(s); else DN.to = setTimeout(function () { dmOpen(s); }, 110);
    });
    bar.addEventListener('mouseleave', dmLater);
    bar.addEventListener('focusin', function (e) {
      var a = e.target.closest && e.target.closest('.ti'), s = a && a.getAttribute('data-s');
      if (s) dmOpen(s); else dmClose();
    });
    DN.mg.addEventListener('mouseenter', function () { clearTimeout(DN.tc); clearTimeout(DN.to); });
    DN.mg.addEventListener('mouseleave', dmLater);
    mroot.querySelector('.bd').addEventListener('mouseenter', dmLater);
    mroot.querySelector('.bd').addEventListener('click', dmClose);
    [bar, DN.mg].forEach(function (el) {
      el.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[data-n]');
        if (!a) return;
        track('menu-desktop', a.getAttribute('data-n'));
        if (a.className === 'pr') ev('c', slugOf(a.href)); else ev('m', a.getAttribute('data-n'));
        var t = spaTarget(e, a);
        if (t) { e.preventDefault(); dmClose(); routerPush(t); }
      });
      // Fare bir linkin üstüne gelince o sayfanın kodunu önceden indir
      el.addEventListener('mouseover', function (e) { var a = e.target.closest && e.target.closest('a[href]'); if (a) prefetchRoute(a.href); });
    });
    DN.mg.addEventListener('keydown', function (e) { if (e.key === 'Escape') { dmClose(); try { bar.querySelector('.ti.on, .ti').focus(); } catch (x) {} } });
  }
  // Ürün verisi gelince özeti yenile; değiştiyse menüyü aynı anda (arada ikas menüsü görünmeden) yeniden kur
  function dmRefresh() {
    var M = dmModel(), js = JSON.stringify(M);
    try { localStorage.setItem(DM_KEY, js); } catch (e) {}
    if (DM && JSON.stringify(DM) === js && DN) return;
    DM = M;
    if (M.off) { unmountNav(); clearPre(); return; }
    unmountNav();
    mountNav();
    if (!DN && !DM_WAIT) clearPre();
  }
  (function dmInit() {
    if (ds.dmenu === 'off' || !wideScreen()) return;
    try { DM = JSON.parse(localStorage.getItem(DM_KEY) || 'null'); } catch (e) { DM = null; }
    if (DM && DM.v !== 1) DM = null;
    var started = false;
    var go = function () {
      if (started) return;
      started = true;
      try {
        if (DM) mountNav();
        else { var g = guessNav(); if (g) preHide(g); }
      } catch (e) {}
      // Menü özeti küçük menu.json'dan (~5 KB, öne çıkan ürünler sunucuda hazırlanmış) kurulur; 300 KB'lık ürün
      // verisi beklenmez. menu.json yoksa / eskiyse ürün verisine düşülür.
      loadLite().then(function () {
        if (DATA || (LITE && LITE.dmp)) return dmRefresh();
        DM_NEED = true;
        return load().then(dmRefresh);
      }).catch(function () { if (!DN) clearPre(); });
    };
    if (document.readyState !== 'loading') return go();
    document.addEventListener('DOMContentLoaded', go);
    // "async" etiketle kod sayfa HTML'i bitmeden çalışabilir: başlıktaki menü oluşur oluşmaz devreye gir
    // (DOMContentLoaded sitenin büyük paketlerinin çalışmasını bekler; ikas menüsü o arada görünmesin)
    var n = 0;
    (function early() {
      if (started || document.readyState !== 'loading') return;
      try { if (document.body && (DM ? findNav(DM) : guessNav())) return go(); } catch (e) {}
      if (++n < 300) requestAnimationFrame(early);
    })();
  })();
  // Ekran boyutu değişince yeniden kur (masaüstünden çıkınca ikas menüsü geri gelir);
  // ikas başlığı yeniden çizerse (sayfa geçişi) menüyü tekrar yerleştir
  (function () {
    var t, tries = 0;
    window.addEventListener('resize', function () {
      if (!DM) return;
      clearTimeout(t);
      t = setTimeout(function () { tries = 0; unmountNav(); mountNav(); }, 250);
    });
    window.addEventListener('scroll', function () { if (DN && DN.cur) dmTop(); }, { passive: true });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && DN && DN.cur) dmClose(); });
    // ikas sayfa geçişinde başlığı yeniden çizer: bizim çubuk silinir ya da ikas'ın öğeleri geri gelir.
    // Kontrol: başlık aynı kaldıysa çubuk anında geri takılır (yeniden kurulmaz, titreme olmaz); başlık değiştiyse
    // yeni başlıkta kurulur. Sayfa geçişinden sonraki 5 sn boyunca 100 ms'de bir, sonra 1,5 sn'de bir bakılır.
    // Deneme sayacı her sayfa geçişinde sıfırlanır (önceden toplam 5 denemeden sonra menü kalıcı olarak düşüyordu).
    var check = function () {
      if (document.hidden || !DM) return;
      if (DN) {
        if (!DN.nav.isConnected) { unmountNav(); }
        else {
          if (!DN.host.isConnected || DN.host.parentNode !== DN.nav) DN.nav.appendChild(DN.host);
          if (!DN.nav.hasAttribute('data-ua-nav')) DN.nav.setAttribute('data-ua-nav', '');
          if (!DN.mhost.isConnected) document.body.appendChild(DN.mhost);
          // ikas aynı yere yeni bir menü daha çizdiyse (eski kaldı ama görünen başka) yeni olana taşı
          var g = null;
          try { g = findNav(DM); } catch (e) {}
          if (g && g.nav !== DN.nav && !DN.nav.getBoundingClientRect().height) unmountNav();
        }
      }
      // Menü hiç bulunamayan sayfalarda boşuna aramaya devam etme (sayfa başına sınır)
      if (!DN && dmenuOn() && tries++ < 60) mountNav();
    };
    setInterval(check, 1500);
    var burst = function () {
      tries = 0;
      var n = 0;
      (function f() { check(); if (++n < 50) setTimeout(f, 100); })();
    };
    ['pushState', 'replaceState'].forEach(function (m) {
      var o = history[m];
      if (typeof o !== 'function') return;
      history[m] = function () { var r = o.apply(this, arguments); if (DM) setTimeout(burst, 0); return r; };
    });
    window.addEventListener('popstate', function () { if (DM) setTimeout(burst, 0); });
  })();

  // Ctrl/Cmd+K ve "/" kısayolları (masaüstü)
  document.addEventListener('keydown', function (e) {
    if (isOpen) return;
    var typing = /input|textarea|select/i.test((document.activeElement || {}).tagName || '');
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); open(); }
  });

  // Açılış: "Ürün Bul" butonu sayfanın gövdesi oluşur oluşmaz kurulur (birkaç ms; ikas'ın betiklerinin ve banner'ların
  // bitmesi beklenmez — canlı sitede telefonda HTML hazır olması ~7 sn sürüyor). Menü verisi (~5 KB) hemen iner;
  // ana ekran, kategoriler, masaüstü menüsü ve ziyaretçi eğilimi kaydı onunla çalışır.
  // Ürün verisi (300 KB): bilgisayarda sayfa tamamen yüklendikten sonra boşta; telefonda sadece müşteri Ürün Bul'a /
  // menüye dokununca iner (Ürün Bul'u kullanmayan ziyaretçinin telefonu hiç yorulmaz).
  function prefetch(why) {
    if (prefetch.done) return;
    prefetch.done = true;
    load(why === 'idle' ? 'low' : '').catch(function () {});
  }
  function boot() {
    if (boot.done) return;
    boot.done = true;
    build();
    loadLite().then(evPage);
    var later = function () { setTimeout(function () { idle(function () { prefetch('idle'); }, 4000); }, 1500); };
    if (!wideScreen() || slowNet()) return;
    if (document.readyState === 'complete') later(); else window.addEventListener('load', later);
  }
  if (document.body) boot();
  else {
    document.addEventListener('DOMContentLoaded', boot);
    (function waitBody() { if (document.body) boot(); else if (!boot.done) setTimeout(waitBody, 50); })();
  }

  // Menüye "#hacim-hesapla" veya "#urun-ara" bağlantısı eklenerek açılabilir
  function fromHash() {
    var h = location.hash;
    if (h !== '#hacim-hesapla' && h !== '#urun-ara') return;
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) {}
    var go = function () { open('', h === '#hacim-hesapla' ? 'calc' : 'home'); };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }
  // #ua-debug: telefonda öğrenilen ikas arama butonu/penceresini gösterir ve kopyalar (config.json'a eklemek için)
  function debugHash() {
    if (location.hash !== '#ua-debug') return;
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) {}
    var show = function () {
      var alog = []; try { alog = JSON.parse(localStorage.getItem('ua-addlog') || '[]'); } catch (e) {}
      // Hız bilgisi: kod sayfa açılışından kaç ms sonra çalıştı, HTML ve tüm sayfa ne zaman hazır oldu, etiket türü
      var nav = (window.performance && performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || {};
      var hiz = { kodCalisti: T_EXEC, htmlHazir: Math.round(nav.domContentLoadedEventEnd || 0), tamYuklendi: Math.round(nav.loadEventEnd || 0),
        etiket: script ? (script.async ? 'async' : script.defer ? 'defer' : 'normal') : '?', baglanti: (navigator.connection || {}).effectiveType || '?', next: !!(window.next && window.next.router) };
      window.prompt('Bu metni kopyalayıp gönderin:', JSON.stringify({ hiz: hiz, trig: learned, ovl: ovl, menu: menuLearned, ekleme: alog }));
    };
    // Sayfa tamamen yüklendikten sonra göster (süreler dolu gelsin)
    if (document.readyState === 'complete') setTimeout(show, 300); else window.addEventListener('load', function () { setTimeout(show, 300); });
  }

  window.addEventListener('hashchange', debugHash);
  debugHash();
  window.addEventListener('hashchange', fromHash);
  fromHash();

  // ikas'ın arama sonuç sayfasına bir şekilde gelinirse (eski bağlantı, Google vb.) bizim paneli o aramayla aç
  (function fromSearchPage() {
    if (!/^\/(search|arama)\/?$/i.test(location.pathname) || ds.searchPage === 'off') return;
    var m = location.search.match(/[?&](q|s|query|keyword)=([^&]*)/);
    var q = m ? decodeURIComponent(m[2].replace(/\+/g, ' ')) : '';
    var go = function () { open(q); };
    if (document.body) setTimeout(go, 0); else document.addEventListener('DOMContentLoaded', go);
  })();

  window.UrunArama = window.PMSearch = { open: open, close: close, calc: function () { open('', 'calc'); }, search: function (q) { return load().then(function () { return search(q); }); } };
})();
