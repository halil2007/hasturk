/*! Mağaza arama widget'ı — ikas için. Tek satırla eklenir:
 *  <script src="https://hasturk-arama.halilc2007.workers.dev/pm-search.js" defer></script>
 *  İsteğe bağlı data-* ayarları:
 *   data-selector  hangi arama kutuları yakalansın (CSS seçici)
 *   data-trigger   tıklanınca aramayı açacak ek öğeler (örn. büyüteç ikonu)
 *   data-json      products.json adresi (varsayılan: script ile aynı klasör)
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
  var JSON_URL = ds.json || BASE + 'products.json';
  var STORE = (ds.store || location.origin).replace(/\/$/, '');
  var SELECTOR = ds.selector || 'input[type="search"], input[name="q"], input[name="s"], input[placeholder]';
  var TRIGGER = ds.trigger || '';
  var CACHE_KEY = 'ua-data-v4';
  var RECENT_KEY = 'ua-recent';
  var CACHE_MS = 20 * 60 * 1000;
  var PAGE = 10;

  // ---------------- Türkçe normalizasyon ----------------
  var FOLD = { 'ı': 'i', 'ş': 's', 'ğ': 'g', 'ü': 'u', 'ö': 'o', 'ç': 'c', 'â': 'a', 'î': 'i', 'û': 'u' };
  function fold(s) {
    var out = '';
    s = String(s || '');
    for (var i = 0; i < s.length; i++) {
      var c = s[i].toLocaleLowerCase('tr-TR');
      out += FOLD[c] || (c.length > 1 ? c[0] : c);
    }
    return out;
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
  var HIDDEN_TAG = /^kdv[\s_-]*\d+$/i; // muhasebe etiketleri aramada/rozette görünmesin

  // ---------------- Veri ----------------
  var DATA = null, CATS_BY_ID = {}, KIDS = {}, SYN = {}, CFG = {}, loading = null;

  function prepare(d) {
    DATA = d;
    CFG = d.config || {};
    SYN = {};
    Object.keys(CFG.synonyms || {}).forEach(function (k) {
      SYN[fold(k)] = (CFG.synonyms[k] || []).map(fold);
    });
    CATS_BY_ID = {};
    KIDS = {};
    d.cats.forEach(function (c) { CATS_BY_ID[c.id] = c; c.f = fold(c.n); });
    d.cats.forEach(function (c) { if (c.p && CATS_BY_ID[c.p]) (KIDS[c.p] = KIDS[c.p] || []).push(c); });
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
    // Kategori görseli: config.json > categoryImages'daki ürün; yoksa kategorideki (alt kategoriler dahil)
    // stoktaki mağaza markalı ürün; o da yoksa stoktaki ilk görselli ürün
    function ids(id) { return [id].concat((KIDS[id] || []).reduce(function (a, k) { return a.concat(ids(k.id)); }, [])); }
    var bySlug = {}, cover = {}, own = new RegExp(CFG.brandPattern || 'has ?t[uü]rk|^hg$', 'i');
    d.items.forEach(function (p) { bySlug[p.s] = p; });
    Object.keys(CFG.categoryImages || {}).forEach(function (n) { cover[fold(n)] = bySlug[CFG.categoryImages[n]]; });
    d.cats.forEach(function (c) {
      var set = {};
      ids(c.id).forEach(function (x) { set[x] = 1; });
      var inCat = d.items.filter(function (p) { return p.img && p.c.some(function (x) { return set[x]; }); });
      var inStock = inCat.filter(function (p) { return p.st; });
      var pick = (cover[c.f] && cover[c.f].img ? cover[c.f] : null) ||
        inStock.filter(function (p) { return own.test(p.b || ''); })[0] || inStock[0] || inCat[0];
      c.img = pick ? pick.img : '';
    });
    applyConfig();
  }

  function load() {
    if (DATA) return Promise.resolve(DATA);
    if (loading) return loading;
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && Date.now() - c.t < CACHE_MS && c.d && c.d.items) { prepare(c.d); return Promise.resolve(DATA); }
    } catch (e) {}
    loading = fetch(JSON_URL, { credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
        prepare(d);
        return d;
      })
      .catch(function (e) { loading = null; throw e; });
    return loading;
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

  function search(q) {
    var qn = fold(q).trim();
    if (!qn || !DATA) return { items: [], cats: [], tokens: [] };
    var tokens = qn.split(/\s+/).filter(Boolean), res = [];
    DATA.items.forEach(function (p) {
      var total = 0, hits = [];
      for (var i = 0; i < tokens.length; i++) {
        var r = scoreToken(p, tokens[i]);
        if (!r[0]) return;
        total += r[0]; hits.push(r[1]);
      }
      if (p.nf.indexOf(qn) === 0) total += 4;
      else if (p.nf.indexOf(qn) !== -1) total += 2;
      if (!p.st) total -= 4;
      res.push({ p: p, s: total, h: hits });
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
    '.root{--pr:#0b5d73;--prd:#07404f;--soft:#e8f3f6;--bg:#f3f6f7;--ln:#e3e8eb;--ink:#14212b;--mu:#66737c;--ac:#d7372f;--ok:#1f8a5b;',
    ' font-family:inherit;color:var(--ink);-webkit-font-smoothing:antialiased;font-size:15px;line-height:1.35}',

    /* Ürün Bul butonu */
    '.fab{position:fixed;z-index:2147482990;bottom:calc(var(--fb,20px) + var(--lift,0px) + env(safe-area-inset-bottom,0px));right:20px;display:flex;align-items:center;gap:10px;',
    ' height:52px;padding:0 20px 0 8px;border-radius:26px;background:var(--pr);color:#fff;font-weight:700;font-size:15px;',
    ' box-shadow:0 10px 28px rgba(7,50,64,.3);transition:padding .25s,gap .25s,transform .2s,opacity .25s,bottom .35s cubic-bezier(.2,.8,.2,1)}',
    /* Hareket: yayılan halka, parıltı, arada "etrafa bakan" büyüteç, girişte zıplama */
    '.fab::before{content:"";position:absolute;inset:-3px;border-radius:inherit;border:2px solid var(--pr);opacity:0;pointer-events:none;animation:fring 2.8s ease-out infinite}',
    '@keyframes fring{0%{transform:scale(1);opacity:.6}75%,100%{transform:scale(1.12,1.4);opacity:0}}',
    '.fab .gl{position:absolute;inset:0;border-radius:inherit;overflow:hidden;pointer-events:none}',
    '.fab .gl::after{content:"";position:absolute;top:0;bottom:0;left:-45%;width:35%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.38),transparent);transform:skewX(-18deg);animation:fshine 5.5s ease-in-out infinite 1.2s}',
    '@keyframes fshine{0%,62%{left:-45%}82%,100%{left:120%}}',
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
    '.ov{position:fixed;inset:0;z-index:2147483000;display:none;background:rgba(10,24,32,.5);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}',
    '.ov.on{display:block}',
    '.panel{position:absolute;inset:0;background:#fff;display:flex;flex-direction:column;overflow:hidden;animation:up .22s cubic-bezier(.2,.8,.2,1)}',
    '@keyframes up{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}',
    '@media(min-width:760px){.panel{inset:5vh auto auto 50%;transform:translateX(-50%);width:min(1000px,calc(100vw - 32px));height:min(84vh,760px);',
    ' border-radius:24px;box-shadow:0 30px 90px rgba(5,25,35,.35);animation:none}}',

    '.top{flex:none;display:flex;align-items:center;gap:8px;padding:10px 12px}',
    '.back,.xbtn{width:42px;height:42px;display:grid;place-items:center;border-radius:50%;flex:none}',
    '.back{background:var(--bg)}.back svg{width:22px;height:22px}',
    '.xbtn{display:none;background:var(--bg)}.xbtn svg{width:20px;height:20px}.xbtn:hover{background:var(--ln)}',
    '.field{flex:1;display:flex;align-items:center;gap:10px;height:48px;padding:0 6px 0 16px;border-radius:24px;background:var(--bg);min-width:0;border:2px solid transparent;transition:border-color .15s,background .15s}',
    '.field:focus-within{border-color:var(--pr);background:#fff}',
    '.field>svg{width:20px;height:20px;color:var(--pr);flex:none}',
    '.field input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:16px;color:var(--ink);-webkit-appearance:none;appearance:none}',
    '.field input::placeholder{color:#8d989f}',
    '.field input::-webkit-search-cancel-button{display:none}',
    '.clr{width:32px;height:32px;border-radius:50%;display:none;place-items:center;color:var(--mu);background:#fff}',
    '.clr.on{display:grid}.clr svg{width:16px;height:16px}',
    '@media(min-width:760px){.back{display:none}.xbtn{display:grid}.top{padding:16px 16px 12px 20px;border-bottom:1px solid var(--ln)}.field{height:52px}.field input{font-size:17px}}',

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
    '.help p{font-size:12.5px;color:#b9d3db;margin:2px 0 10px}',
    '.help a{display:flex;align-items:center;gap:7px;height:40px;padding:0 10px;border-radius:12px;font-size:13px;font-weight:700;margin-top:6px;white-space:nowrap}',
    '.help a svg{width:18px;height:18px;flex:none}',
    '.help .wa{background:#25a162}',
    '.help .tel{background:rgba(255,255,255,.12)}',

    /* Mobil alt çubuk */
    '.mfoot{flex:none;display:none;gap:8px;padding:8px 12px calc(8px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--ln);background:#fff}',
    '.mfoot.on{display:flex}',
    '@media(min-width:760px){.mfoot.on{display:none}}',
    '.typing .mfoot{display:none!important}',
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
    '.tq:hover{background:#d6eaf0}',
    '.center{justify-content:center;flex-wrap:wrap}',

    /* Hesaplayıcı banner */
    '.promo{margin:12px 16px 0;border-radius:18px;overflow:hidden;background:linear-gradient(135deg,var(--prd),var(--pr));color:#fff}',
    '@media(min-width:760px){.promo{margin:18px 20px 0}}',
    '.pm1{display:flex;align-items:center;gap:12px;padding:14px}',
    '.pbadge{width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.15);display:grid;place-items:center;flex:none}',
    '.pbadge svg{width:22px;height:22px}',
    '.pm1 .tx{flex:1;min-width:0}.pm1 b{display:block;font-size:15px}.pm1 .tx span{display:block;font-size:12.5px;color:#cfe3e9;margin-top:1px}',
    '.pcode{flex:none;display:flex;flex-direction:column;align-items:center;padding:6px 12px;border-radius:12px;background:#fff;color:var(--prd);border:2px dashed #9cc7d3}',
    '.pcode b{font-size:14px;font-weight:800;letter-spacing:.04em}.pcode em{font-style:normal;font-size:11px;font-weight:700;color:var(--mu)}',
    '.pm2{display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(0,0,0,.18);font-size:13px;font-weight:600}',
    '.pm2 svg{width:18px;height:18px;flex:none}',
    '.sh-ship{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:12px;font-size:12.5px;font-weight:600;color:var(--mu)}',
    '.sh-ship svg{width:16px;height:16px;color:var(--ok)}',
    '.banner{display:flex;align-items:center;gap:14px;margin:16px 16px 0;padding:16px;border-radius:20px;background:linear-gradient(135deg,var(--prd),var(--pr));color:#fff;text-align:left;width:calc(100% - 32px)}',
    '@media(min-width:760px){.banner{margin:20px 20px 0;width:calc(100% - 40px)}}',
    '.banner .bi{width:48px;height:48px;border-radius:14px;background:rgba(255,255,255,.14);display:grid;place-items:center;flex:none}',
    '.banner .bi svg{width:26px;height:26px}',
    '.banner div.tx{flex:1;min-width:0}',
    '.banner b{display:block;font-size:16px}',
    '.banner span{display:block;font-size:13px;color:#cfe3e9;margin-top:2px}',
    '.banner>svg{width:22px;height:22px;flex:none}',

    /* Kategoriler */
    '.tabs{flex:none;display:flex;border-bottom:1px solid var(--ln);background:#fff}',
    '@media(min-width:760px){.tabs{display:none}}',
    '.typing .tabs{display:none}',
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
    '.ctitle{padding:6px 16px 12px;font-size:22px;font-weight:800}',
    '@media(min-width:760px){.ctitle{padding:6px 20px 12px}}',
    '.all-in{display:flex;align-items:center;justify-content:space-between;margin:0 16px 10px;padding:14px 16px;border-radius:16px;background:var(--pr);color:#fff;font-weight:700;font-size:14.5px}',
    '@media(min-width:760px){.all-in{margin:0 20px 10px}}',
    '.all-in svg{width:18px;height:18px}',

    '.im{flex:none;border-radius:12px;background:var(--bg);overflow:hidden;display:grid;place-items:center;color:#a9c3cc;position:relative}',
    '.im img{width:100%;height:100%;object-fit:cover;display:block}',
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
    '.ptoast span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
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
    '.res span{display:block;font-size:13px;color:#cfe3e9;margin-top:3px}',
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
    '.gc>svg{width:18px;height:18px;color:var(--pr);flex:none}'
  ].join('\n');

  var host, root, $wrap, $ov, $panel, $q, $clr, $rail, $tools, $res, $idle, $home, $calc, $pages, $body, $cta, $mfoot, $help, $fab, $sheet, $toast;
  var $guide, GID = null;
  var isOpen = false, sel = -1, pushed = false;
  var onlyStock = false, sortMode = 'rel', shown = PAGE, view = null, tab = 'home';
  var TABS = [['home', 'Kategoriler', 'grid', 'Kategoriler'], ['calc', 'Hacim Hesapla', 'calc', 'Hacim'], ['guide', 'Kullanım Rehberi', 'book', 'Rehber'], ['pages', 'Sayfalar', 'doc', 'Sayfalar']];
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
      '<div class="top"><button class="back" type="button" data-act="close" aria-label="Kapat">' + I.x + '</button>' +
      '<label class="field">' + I.search +
      '<input type="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Ara">' +
      '<button class="clr" type="button" data-act="clear" aria-label="Temizle">' + I.x + '</button></label>' +
      '<button class="xbtn" type="button" data-act="close" aria-label="Kapat">' + I.x + '</button></div>' +
      '<div class="mid"><nav class="rail">' + TABS.map(function (t) {
        return '<button class="nav" type="button" data-act="tab" data-v="' + t[0] + '">' + I[t[2]] + '<span>' + t[1] + '</span></button>';
      }).join('') + '<div class="help"></div></nav>' +
      '<div class="main"><div class="tabs">' + TABS.map(function (t) {
        return '<button class="tb" type="button" data-act="tab" data-v="' + t[0] + '">' + I[t[2]] + '<span>' + t[3] + '</span></button>';
      }).join('') + '</div><div class="tools"></div>' +
      '<div class="body"><div class="idle"><div class="pane home on"></div><div class="pane calc-p"></div><div class="pane guide"></div><div class="pane pages"></div></div>' +
      '<div class="results" aria-live="polite"></div></div>' +
      '<div class="cta"></div><div class="mfoot"></div>' +
      '<div class="sheet"></div><div class="toast"></div></div></div>' +
      '</div></div></div>';
    document.body.appendChild(host);
    host.style.fontFamily = getComputedStyle(document.body).fontFamily;
    $wrap = root.querySelector('.root');
    $fab = root.querySelector('.fab');
    $ov = root.querySelector('.ov');
    $panel = root.querySelector('.panel');
    $q = root.querySelector('.top input');
    $clr = root.querySelector('.clr');
    $rail = root.querySelector('.rail');
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
      if (t && t.tagName === 'IMG' && t.parentNode) t.parentNode.innerHTML = I.sprout;
    }, true);
    root.addEventListener('click', onClick);
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
      if (a) { if ($q.value.trim()) addRecent($q.value); track(a.getAttribute('data-kind'), a.getAttribute('data-name')); }
      return;
    }
    var act = b.getAttribute('data-act'), v = b.getAttribute('data-v');
    if (act === 'close') close();
    else if (act === 'back') {
      // Mobil geri: önce iç görünümden çık, en son paneli kapat
      if ($q.value) { $q.value = ''; render(); }
      else if (view) { view = CATS_BY_ID[view] && CATS_BY_ID[view].p && CATS_BY_ID[CATS_BY_ID[view].p] ? CATS_BY_ID[view].p : null; renderIdle(); }
      else if (tab !== 'home') setTab('home');
      else close();
    }
    else if (act === 'clear') { $q.value = ''; render(); $q.focus(); }
    else if (act === 'q') { $q.value = v; shown = PAGE; render(); $q.focus(); }
    else if (act === 'del') { e.stopPropagation(); var f = fold(v); setRecent(getRecent().filter(function (x) { return fold(x) !== f; })); renderIdle(); }
    else if (act === 'delall') { setRecent([]); renderIdle(); }
    else if (act === 'cat') { view = v || null; renderIdle(); $body.scrollTop = 0; }
    else if (act === 'stock') { onlyStock = !onlyStock; shown = PAGE; render(); }
    else if (act === 'sort') { sortMode = v; shown = PAGE; render(); }
    else if (act === 'more') { shown += PAGE; render(); }
    else if (act === 'copy') copyText(v);
    else if (act === 'tab') { if ($q.value) { $q.value = ''; render(); } view = null; renderIdle(); setTab(v); }
    else if (act === 'gocalc') { $q.value = ''; render(); setTab('calc'); }
    else if (act === 'guide') { GID = v; renderGuide(); }
    else if (act === 'goguide') { GID = v; $q.value = ''; render(); setTab('guide'); }
    else if (act === 'goguideq') { GQ = v; $q.value = ''; render(); setTab('guide'); }
    else if (act === 'add') openAdd(v);
    else if (act === 'vo') pickVariant(v);
    else if (act === 'sq') { SH.qty = Math.max(1, Math.min(99, SH.qty + (+v))); $sheet.querySelector('.qty input').value = SH.qty; }
    else if (act === 'shx') closeSheet();
    else if (act === 'shgo') doAdd();
    else if (act === 'tocm') { e.preventDefault(); var ub = $calc.querySelector('.unit [data-v="cm"]'); if (ub) calcAction('unit', 'cm', ub); }
    else if (act === 'shape' || act === 'unit' || act === 'qty') calcAction(act, v, b);
  }

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
    $calc.classList.toggle('on', t === 'calc');
    $pages.classList.toggle('on', t === 'pages');
    $guide.classList.toggle('on', t === 'guide');
    if (t === 'guide') renderGuide();
    if (t === 'calc') calcBuild();
    $body.scrollTop = 0;
  }

  function applyConfig() {
    if (!$wrap) return;
    var c = CFG.colors || {};
    if (c.primary) $wrap.style.setProperty('--pr', c.primary);
    if (c.dark) $wrap.style.setProperty('--prd', c.dark);
    if (c.soft) $wrap.style.setProperty('--soft', c.soft);
    if (c.accent) $wrap.style.setProperty('--ac', c.accent);
    if (CFG.placeholder) $q.placeholder = CFG.placeholder;
    var fab = CFG.fab || {};
    $fab.querySelector('span.t').textContent = fab.text || 'Ürün Bul';
    $fab.classList.toggle('left', fab.side === 'left');
    if (fab.bottom != null) $wrap.style.setProperty('--fb', (+fab.bottom || 0) + 'px');
    updateFab();
    BY_ID = {};
    DATA.items.forEach(function (p) { BY_ID[p.id] = p; });

    // İletişim: masaüstünde sol menünün altında, mobilde alt çubukta
    var telHref = CFG.phone ? 'tel:' + CFG.phone.replace(/[^\d+]/g, '') : '';
    var wa = CFG.whatsapp ? '<a class="wa" data-kind="whatsapp" data-name="whatsapp" target="_blank" rel="noopener" href="' + esc(waHref()) + '">' + I.chat + '<span>WhatsApp</span></a>' : '';
    $help.innerHTML = wa || telHref ? '<b>Yardım mı lazım?</b><p>Doğru ürünü birlikte seçelim.</p>' + wa +
      (telHref ? '<a class="tel" data-kind="phone" data-name="phone" href="' + esc(telHref) + '">' + I.phone + '<span>' + esc(CFG.phone) + '</span></a>' : '') : '';
    $help.style.display = wa || telHref ? '' : 'none';
    $mfoot.innerHTML = wa + (telHref ? '<a class="tel" data-kind="phone" data-name="phone" href="' + esc(telHref) + '">' + I.phone + '<span>Bizi arayın</span></a>' : '');
    $mfoot.classList.toggle('on', !!(wa || telHref));
    renderIdle();
    setTab(tab);
  }

  function waHref(text) {
    return 'https://wa.me/' + String(CFG.whatsapp || '').replace(/\D/g, '') + (text ? '?text=' + encodeURIComponent(text) : '');
  }
  function pageHref(u) { return /^(https?:|tel:|mailto:)/.test(u) ? u : STORE + '/' + String(u || '').replace(/^\//, ''); }
  function url(slug) { return STORE + '/' + String(slug).replace(/^\//, ''); }

  function imgSrc(img, size) {
    if (!img || !DATA.merchant) return '';
    var parts = img.split('/');
    return 'https://cdn.myikas.com/images/' + DATA.merchant + '/' + parts[0] + '/' + size + '/' + encodeURIComponent(parts[1] || 'image') + '.webp';
  }
  function thumb(img, size, extra) {
    var src = imgSrc(img, size);
    return '<div class="im">' + (src ? '<img loading="lazy" alt="" src="' + esc(src) + '">' : I.sprout) + (extra || '') + '</div>';
  }


  // ---- Keşfet ----
  // Sıra: categoryOrder'dakiler verilen sırayla, sonra diğerleri (çok üründen aza), en sonda categoryLast
  function topCats() {
    var first = (CFG.categoryOrder || []).map(fold), last = (CFG.categoryLast || []).map(fold);
    var rank = function (c) {
      var i = first.indexOf(c.f), j = last.indexOf(c.f);
      return i >= 0 ? i : j >= 0 ? 1000 + j : 500;
    };
    return DATA.cats.filter(function (c) { return !c.p || !CATS_BY_ID[c.p]; })
      .sort(function (a, b) { return rank(a) - rank(b) || b.k - a.k; });
  }
  function catRow(c) {
    var inner = thumb(c.img, 180) + '<span class="n">' + esc(c.n) + '<small>' + c.k + ' ürün</small></span>' + I.right;
    return KIDS[c.id]
      ? '<button class="li" type="button" data-act="cat" data-v="' + esc(c.id) + '">' + inner + '</button>'
      : '<a class="li" data-kind="category" data-name="' + esc(c.n) + '" href="' + esc(url(c.s)) + '">' + inner + '</a>';
  }
  function pageRows() {
    return (CFG.pages || []).map(function (pg) {
      return '<a class="li" data-kind="page" data-name="' + esc(pg.title) + '" href="' + esc(pageHref(pg.url)) + '">' +
        '<span class="ico">' + I.doc + '</span><span class="n">' + esc(pg.title) + '</span>' + I.right + '</a>';
    }).join('');
  }

  // Kampanya kartı (config.json > promo): ilk sipariş kodu ve ücretsiz kargo eşiği
  function promoHtml() {
    var pr = CFG.promo;
    if (!pr || (!pr.code && !pr.shipping)) return '';
    return '<div class="promo">' + (pr.code ? '<div class="pm1"><span class="pbadge">' + I.tag + '</span><div class="tx"><b>' + esc(pr.title || 'İlk siparişe özel indirim') + '</b>' +
      (pr.note ? '<span>' + esc(pr.note) + '</span>' : '') + '</div>' +
      '<button class="pcode" type="button" data-act="copy" data-v="' + esc(pr.code) + '"><b>' + esc(pr.code) + '</b><em>Kopyala</em></button></div>' : '') +
      (pr.shipping ? '<div class="pm2">' + I.truck + '<span>' + esc(pr.shipping) + '</span></div>' : '') + '</div>';
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
    $pages.innerHTML = '<div class="h">Sayfalar</div><div class="list">' + pageRows() + '</div>';
    if (!DATA) { $home.innerHTML = '<div class="spin"></div>'; return; }
    if (view && CATS_BY_ID[view]) { $home.innerHTML = renderCat(CATS_BY_ID[view]); return; }
    view = null;
    var html = '';
    var rec = getRecent(), pop = CFG.popular || [];
    var seen = rec.map(fold);
    pop = pop.filter(function (t) { return seen.indexOf(fold(t)) === -1; });
    if (rec.length || pop.length) {
      html += '<div class="h">' + (rec.length ? 'Son ve sık aramalar<button type="button" data-act="delall">Geçmişi temizle</button>' : 'Sık arananlar') + '</div><div class="trend">' +
        rec.map(function (t) { return '<button class="tq rc" type="button" data-act="q" data-v="' + esc(t) + '">' + I.clock + esc(t) + '</button>'; }).join('') +
        pop.map(function (t) { return '<button class="tq" type="button" data-act="q" data-v="' + esc(t) + '">' + I.trend + esc(t) + '</button>'; }).join('') +
        '</div>';
    }
    html = promoHtml() + html;
    var tops = topCats();
    if (tops.length) {
      html += '<div class="h">Kategoriler<small>' + DATA.items.length + ' ürün</small></div><div class="clist">' + tops.map(catRow).join('') + '</div>';
    }
    $home.innerHTML = html;
  }

  function renderCat(c) {
    var parent = c.p && CATS_BY_ID[c.p];
    return '<div class="crumb"><button type="button" data-act="cat" data-v="' + (parent ? esc(parent.id) : '') + '">' + I.back +
      esc(parent ? parent.n : 'Tüm kategoriler') + '</button></div>' +
      '<div class="ctitle">' + esc(c.n) + '</div>' +
      '<a class="all-in" data-kind="category" data-name="' + esc(c.n) + '" href="' + esc(url(c.s)) + '"><span>Tüm ' + esc(c.n) + ' (' + c.k + ')</span>' + I.arrow + '</a>' +
      '<div class="clist">' + (KIDS[c.id] || []).slice().sort(function (a, b) { return b.k - a.k; }).map(catRow).join('') + '</div>';
  }

  // ---- Sonuçlar ----
  function price(p) { return p.d != null ? p.d : p.p; }
  function vPrice(v) { return v.d != null ? v.d : v.p; }
  function vOk(v) { return v.st > 0 || !!v.oos; }

  function card(x) {
    var p = x.p, badges = CFG.badges || {};
    var off = p.d != null && p.p ? Math.round((1 - p.d / p.p) * 100) : 0;
    var tagBadges = (p.t || []).filter(function (t) { return badges[t]; })
      .map(function (t) { return '<span class="badge">' + esc(badges[t]) + '</span>'; }).join('');
    var vnames = (p.v || []).map(function (v) { return v.name; }).filter(Boolean);
    var chip = vnames.length > 1 ? vnames.length + ' seçenek · ' + vnames[0] + ' – ' + vnames[vnames.length - 1] : vnames[0] || '';
    var pr = p.p == null ? '' :
      (p.d != null ? '<b class="dsc">' + tl(p.d) + '</b><s>' + tl(p.p) + '</s>' : '<b>' + tl(p.p) + '</b>') +
      (p.multi ? '<small>başlayan fiyatlarla</small>' : '');
    var href = esc(url(p.s));
    return '<div class="card"><a class="ph" data-kind="product" data-name="' + esc(p.n) + '" href="' + href + '">' +
      thumb(p.img, 360, (off >= 1 ? '<span class="off">-%' + off + '</span>' : '') + (p.st ? '' : '<span class="oosb">Tükendi</span>')) + '</a>' +
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
      var pop = CFG.popular || [];
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
        return '<a class="cc" data-kind="category" data-name="' + esc(c.n) + '" href="' + esc(url(c.s)) + '">' + esc(c.n) + ' <small>' + c.k + '</small></a>';
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
  function guideSearch() {
    var res = $guide.querySelector('.gres'), lst = $guide.querySelector('.glist');
    if (!res) return;
    var toks = fold(GQ).trim().split(/\s+/).filter(function (t) { return t.length >= 2; });
    if (!toks.length) { res.innerHTML = ''; lst.style.display = ''; return; }
    lst.style.display = 'none';
    var hits = guides().map(function (gd) { return { gd: gd, hit: plantHit(gd, toks, 3) }; });
    var any = hits.some(function (x) { return x.hit; });
    if (!any) {
      res.innerHTML = '<div class="empty" style="padding:28px 8px 8px"><div class="ic">' + I.sprout + '</div><b>“' + esc(GQ.trim()) + '” rehberde yok</b><p>Bitki adını farklı yazmayı deneyin (örn. biber, elma, çim).' +
        (CFG.whatsapp ? ' Ya da <a target="_blank" rel="noopener" href="' + esc(waHref('Merhaba, ' + GQ.trim() + ' için gübre kullanım miktarını öğrenmek istiyorum.')) + '">WhatsApp\'tan sorun</a>.' : '') + '</p></div>';
      return;
    }
    // Dozu olanlar önce; eşleşme olmayan ama grubu olmayan (henüz verisi girilmemiş) rehberler bağlantı olarak
    hits.sort(function (a, b) { return (b.hit && b.hit.gr.steps.length ? 1 : 0) - (a.hit && a.hit.gr.steps.length ? 1 : 0); });
    res.innerHTML = hits.filter(function (x) { return x.hit || !(x.gd.groups || []).length; }).map(function (x) {
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

  function openAdd(id) {
    var p = BY_ID[id];
    if (!p) return;
    var vs = (p.v || []).filter(function (v) { return v.id; });
    if (typeof window.UrunAramaSepet !== 'function') loadFrame(p).catch(function () {});
    if (vs.length <= 1) { SH = { p: p, v: vs[0] || { id: p.v1, p: p.p, d: p.d, st: p.st }, qty: 1 }; doAdd(); return; }
    var first = vs.filter(vOk)[0] || vs[0];
    SH = { p: p, v: first, qty: 1 };
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
    var p = SH.p, v = SH.v, qty = SH.qty;
    if (!p || !v || SH.busy) return;
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
    addViaFrame(p, v).then(function () {
      setBusy(p.id, false);
      closeSheet();
      ptoast('Sepete eklendi' + (v.name ? ': ' + v.name : ''), false, true);
      track('add_to_cart_ok', p.n);
    }, function (why) {
      setBusy(p.id, false);
      track('add_to_cart_fail', p.n + ' (' + why + ')');
      addFailed(p);
    });
  }
  function addFailed(p) {
    closeSheet();
    ptoast('Ürün şu an buradan eklenemedi.', true, false, url(p.s), 'Ürün sayfasına git');
  }
  function setBusy(id, on) {
    SH.busy = on;
    var bs = root.querySelectorAll('[data-act="add"][data-v="' + id + '"], [data-act="shgo"]');
    [].forEach.call(bs, function (b) {
      if (on) { b.setAttribute('data-html', b.innerHTML); b.innerHTML = '<span class="bspin"></span><span>Ekleniyor</span>'; b.disabled = true; }
      else if (b.getAttribute('data-html') != null) { b.innerHTML = b.getAttribute('data-html'); b.removeAttribute('data-html'); b.disabled = false; }
    });
  }

  var FRAME = 'ua-sepet-cercevesi';
  // Çerçevedeki sayfanın sepet isteklerini izle (ikas sepete eklemeyi fetch/XHR ile yapar; adında "cart" geçer)
  function watchCart(w, cb) {
    var isCart = function (u, body) { return /cart|sepet/i.test(String(u || '')) || /cart/i.test(typeof body === 'string' ? body : ''); };
    try {
      var of = w.fetch;
      if (of) w.fetch = function (u, o) {
        var hit = isCart(u && u.url || u, o && o.body);
        return of.apply(this, arguments).then(function (r) { if (hit && r && r.ok) cb(); return r; });
      };
      var X = w.XMLHttpRequest && w.XMLHttpRequest.prototype;
      if (X) {
        var oo = X.open, os = X.send;
        X.open = function (m, u) { this.__ua = u; return oo.apply(this, arguments); };
        X.send = function (b) {
          if (isCart(this.__ua, b)) this.addEventListener('load', function () { if (this.status && this.status < 400) cb(); });
          return os.apply(this, arguments);
        };
      }
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
    var entry = { f: f, t: Date.now(), cbs: [] };
    entry.pr = new Promise(function (resolve, reject) {
      var to = setTimeout(function () { reject('timeout'); }, 20000);
      f.onload = function () {
        clearTimeout(to);
        var w, d;
        try { w = f.contentWindow; d = f.contentDocument; if (!d || !d.body) throw 0; } catch (e) { return reject('blocked'); }
        watchCart(w, function () { entry.cbs.forEach(function (cb) { cb(); }); });
        resolve({ f: f, w: w, d: d, entry: entry });
      };
    });
    entry.pr.catch(function () { delete FRAMES[p.id]; });
    f.src = url(p.s) + (url(p.s).indexOf('?') < 0 ? '?' : '&') + 'ua_frame=1';
    document.body.appendChild(f);
    FRAMES[p.id] = entry;
    // Kullanılmazsa 90 sn sonra kaldır
    setTimeout(function () { if (FRAMES[p.id] === entry) { delete FRAMES[p.id]; if (f.parentNode) f.parentNode.removeChild(f); } }, 95000);
    return entry.pr;
  }
  function addViaFrame(p, v) {
    return loadFrame(p).then(function (fr) {
      return new Promise(function (resolve, reject) {
        var d = fr.d, done = false, clicked = false;
        var finish = function (ok, why) {
          if (done) return;
          done = true;
          clearTimeout(timer);
          fr.entry.cbs = [];
          // Aynı ürün tekrar eklenirse sayfa tazeden yüklensin
          delete FRAMES[p.id];
          setTimeout(function () { if (fr.f.parentNode) fr.f.parentNode.removeChild(fr.f); }, 10000);
          if (ok) resolve(); else reject(why);
        };
        var timer = setTimeout(function () { finish(false, clicked ? 'no-response' : 'timeout'); }, 15000);
        // Sadece butona basıldıktan sonraki sepet isteği sayılır (sayfa açılırken sepet sorgulanabilir)
        fr.entry.cbs.push(function () { if (clicked) finish(true); });
        var tries = 0, picked = !((p.v || []).length > 1);
        (function step() {
          if (done) return;
          tries++;
          var btn = findAddBtn(d);
          if (btn && !picked) {
            if (pickOnPage(v.name, d)) { picked = true; return setTimeout(step, 350); }
          } else if (btn) {
            clicked = true;
            btn.click();
            // Sepet isteği görülmezse 4 sn sonra, buton tıklandığı için yine eklendi say
            return setTimeout(function () { finish(true); }, 4000);
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
  var FORMULA = {
    cyl: function (x) { return 'π × (' + nf(x.d) + ' ÷ 2)² × ' + nf(x.h); },
    cone: function (x) { return 'π × ' + nf(x.h) + ' ÷ 12 × (' + nf(x.d1) + '² + ' + nf(x.d1) + ' × ' + nf(x.d2) + ' + ' + nf(x.d2) + '²)'; },
    box: function (x) { return nf(x.w) + ' × ' + nf(x.l) + ' × ' + nf(x.h); },
    bed: function (x) { return nf(x.bw) + ' × ' + nf(x.bl) + ' × ' + nf(x.bd); }
  };

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
        '<div class="c-head"><b>Toprak hesaplayıcı</b><p>Kabını seç, ölçülerini gir; ne kadar toprak alman gerektiğini söyleyelim.</p></div>' +
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
    // Kayan nokta sapmasını at (100 × 1,1 = 110,00000000000001 → 111 olmasın)
    var rec = Math.max(1, Math.ceil(+(r.total * (1 + extra / 100)).toFixed(6)));
    var big = SHAPES[C.shape].f.some(function (f) { return num(C.val[f[0]]) > 20; }) && C.unit[C.shape] === 'm';
    var html = (big ? '<div class="big">Metre seçiliyken 20\'den büyük değer girdiniz. Ölçüler santimetre mi? <a href="#" data-act="tocm">cm\'ye çevir</a></div>' : '') +
      '<div class="res"><div class="ic">' + I.bag + '</div><div><b>' + fmtL(r.total) + '</b><span>' +
      (C.qty > 1 ? C.qty + ' adet × ' + fmtL(r.one) : SHAPES[C.shape].n + ' iç hacmi') + '</span></div></div>' +
      '<div class="fx"><b>Hesap</b>' + FORMULA[C.shape](r.x) + ' = ' + nf(r.cm3, 0) + ' cm³ = ' + fmtL(r.one) +
      (C.qty > 1 ? '<br>' + C.qty + ' × ' + fmtL(r.one) + ' = ' + fmtL(r.total) : '') + '<small>1 litre = 1.000 cm³</small></div>' +
      '<div class="rec">' + I.check + '<div><b>Önerilen alım: ' + nf(rec, 0) + ' litre</b><span>Toprak sulandıkça yaklaşık %' + extra + ' oturur; bu pay eklendi.</span></div></div>';
    if (r.total >= 1000) {
      html += '<div class="big">Bu yaklaşık ' + (r.total / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' m³ ediyor. ' +
        (CFG.whatsapp ? '<a target="_blank" rel="noopener" href="' + esc(waHref('Merhaba, yaklaşık ' + rec + ' litre toprak almak istiyorum.')) + '">Toplu alım için bize yazın</a>'
          : CFG.phone ? 'Toplu alım için arayın: <a href="tel:' + esc(CFG.phone.replace(/[^\d+]/g, '')) + '">' + esc(CFG.phone) + '</a>' : 'Toplu alımlarda bizimle iletişime geçin.') + '</div>';
    }
    if (DATA) {
      var cats = soilCats();
      if (cats.length) {
        html += '<p class="go">Şimdi uygun toprağı seç<small>Ürün sayfasında toplam ' + fmtL(rec) + ' edecek litre seçeneklerini seçebilirsin.</small></p>' +
          '<div class="gocats">' + cats.map(function (c, i) {
            return '<a class="gc' + (i === 0 ? ' first' : '') + '" data-kind="calc_category" data-name="' + esc(c.n) + '" href="' + esc(url(c.s)) + '">' +
              thumb(c.img, 180) + '<div class="tx"><b>' + esc(c.n) + '</b><small>' + c.k + ' ürün</small></div>' + I.arrow + '</a>';
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
    if (window.MutationObserver) new MutationObserver(later).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    setInterval(fabSpace, 2000);
    updateFab();
  }

  // ---------------- Aç / kapat ----------------
  var prevOverflow = '';
  function open(initial, startTab) {
    build();
    if (!isOpen) {
      isOpen = true;
      view = null;
      setTab(startTab || 'home');
      $ov.classList.add('on');
      updateFab();
      prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      try { history.pushState({ urunArama: 1 }, ''); pushed = true; } catch (e) {}
    }
    if (typeof initial === 'string') $q.value = initial;
    if (tab !== 'calc') $q.focus();
    shown = PAGE;
    render();
    renderIdle();
    load().then(function () { renderIdle(); render(); if (tab === 'calc') calcUpdate(); }, function () {
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

  window.addEventListener('popstate', function () { if (isOpen) { pushed = false; close(true); } updateFab(); });

  // Sitedeki arama kutularını yakala
  function isOurs(el) { return host && (el === host || host.contains(el)); }
  function matches(el, s) { try { return s && el && el.matches && el.matches(s); } catch (e) { return false; } }

  // Sitenin arama kutusu: odak/dokunma olaylarını ikas'a hiç iletme (yoksa ikas kendi aramasını açar)
  // Arama kutusu mu? type=search, name=q/s ya da yer tutucusu "ara/arama/aradığınız/search" kelimesiyle başlayan bir kelime içeriyorsa
  function isSearchInput(el) {
    if (!el || !matches(el, SELECTOR)) return false;
    if (ds.selector) return true;
    if (el.type === 'search' || el.name === 'q' || el.name === 's') return true;
    return words(fold(el.getAttribute('placeholder') || '')).some(function (w) { return /^(ara|arayin|arama|aradiginiz|search)$/.test(w); });
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
    if (lastTap.el !== t && tapTrusted()) { if (closeNative(t, lastTap.el)) learn(lastTap.el); lastTap = { el: null, t: 0 }; }
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
  });
  var lastTap = { el: null, t: 0, href: '' };
  document.addEventListener('click', function (e) {
    if (siteInput(e.target)) { stopAll(e); open(e.target.value); return; }
    var t = triggerOf(e.target);
    if (!t) { if (!isOurs(e.target)) lastTap = { el: e.target, t: Date.now(), href: location.href }; return; }
    e.preventDefault();
    stopAll(e);
    open();
  }, true);

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
    return lastTap.el && Date.now() - lastTap.t < 1500 && lastTap.href === location.href && !isPageLink(lastTap.el);
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
    return true;
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
          var tapped = lastTap.el;
          if (!tapTrusted()) return;
          lastTap = { el: null, t: 0 };
          // Sadece gerçekten açılır bir panel (sabit konumlu kapsayıcı) ise kapat, butonu öğren ve bizimkini aç
          if (!closeNative(inp, tapped)) return;
          learn(tapped);
          open(inp.value || '');
          return;
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // Ctrl/Cmd+K ve "/" kısayolları (masaüstü)
  document.addEventListener('keydown', function (e) {
    if (isOpen) return;
    var typing = /input|textarea|select/i.test((document.activeElement || {}).tagName || '');
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); open(); }
  });

  // Butonu hemen göster, veriyi boşta önceden indir (ilk açılış anında olsun)
  function boot() {
    build();
    var idle = window.requestIdleCallback || function (f) { setTimeout(f, 2500); };
    idle(function () { load().catch(function () {}); });
  }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);

  // Menüye "#hacim-hesapla" veya "#urun-ara" bağlantısı eklenerek açılabilir
  function fromHash() {
    var h = location.hash;
    if (h !== '#hacim-hesapla' && h !== '#urun-ara') return;
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) {}
    var go = function () { open('', h === '#hacim-hesapla' ? 'calc' : 'home'); };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();

  window.UrunArama = window.PMSearch = { open: open, close: close, calc: function () { open('', 'calc'); }, search: function (q) { return load().then(function () { return search(q); }); } };
})();
