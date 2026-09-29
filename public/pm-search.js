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
  if (window.UrunArama) return;

  var script = document.currentScript || document.querySelector('script[src*="pm-search"]');
  var ds = (script && script.dataset) || {};
  var BASE = script ? new URL('.', script.src).href : '/';
  var JSON_URL = ds.json || BASE + 'products.json';
  var STORE = (ds.store || location.origin).replace(/\/$/, '');
  var SELECTOR = ds.selector ||
    'input[type="search"], input[name="q"], input[name="s"], input[placeholder*="ara" i], input[placeholder*="Ara"], input[placeholder*="ARA"]';
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
    // Kategori kartı görseli: o kategorideki (alt kategoriler dahil) stoktaki ilk görselli ürün
    function ids(id) { return [id].concat((KIDS[id] || []).reduce(function (a, k) { return a.concat(ids(k.id)); }, [])); }
    d.cats.forEach(function (c) {
      var set = {};
      ids(c.id).forEach(function (x) { set[x] = 1; });
      var inCat = d.items.filter(function (p) { return p.img && p.c.some(function (x) { return set[x]; }); });
      var pick = inCat.filter(function (p) { return p.st; })[0] || inCat[0];
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
    compass: svg('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'),
    calc: svg('<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7M8.5 11h1M12 11h1M8.5 14.5h1M12 14.5h1M8.5 18h1M12 18h1M15.5 11v7"/>'),
    doc: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'),
    phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
    chat: svg('<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/><path d="M9 10.5c.5 2 2 3.5 4.5 4.5l1.2-1.2 1.8.8"/>'),
    minus: svg('<path d="M6 12h12"/>', 2.4),
    plus: svg('<path d="M12 6v12M6 12h12"/>', 2.4),
    cart: svg('<path d="M3 4h2l2.2 11h11l2-8H6.3"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>'),
    check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 2.6),
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
    '.fab{position:fixed;z-index:2147482990;bottom:calc(var(--fb,20px) + env(safe-area-inset-bottom,0px));right:20px;display:flex;align-items:center;gap:10px;',
    ' height:52px;padding:0 20px 0 8px;border-radius:26px;background:var(--pr);color:#fff;font-weight:700;font-size:15px;',
    ' box-shadow:0 10px 28px rgba(7,50,64,.3);transition:padding .25s,gap .25s,transform .2s,opacity .2s}',
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
    '.back svg{width:24px;height:24px}',
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
    '.tq{flex:none;display:flex;align-items:center;gap:6px;height:38px;padding:0 16px 0 12px;border-radius:19px;background:var(--soft);color:var(--prd);font-size:14px;font-weight:600}',
    '.tq svg{width:15px;height:15px}',
    '.tq:hover{background:#d6eaf0}',
    '.center{justify-content:center;flex-wrap:wrap}',

    /* Hesaplayıcı banner */
    '.banner{display:flex;align-items:center;gap:14px;margin:16px 16px 0;padding:16px;border-radius:20px;background:linear-gradient(135deg,var(--prd),var(--pr));color:#fff;text-align:left;width:calc(100% - 32px)}',
    '@media(min-width:760px){.banner{margin:20px 20px 0;width:calc(100% - 40px)}}',
    '.banner .bi{width:48px;height:48px;border-radius:14px;background:rgba(255,255,255,.14);display:grid;place-items:center;flex:none}',
    '.banner .bi svg{width:26px;height:26px}',
    '.banner div.tx{flex:1;min-width:0}',
    '.banner b{display:block;font-size:16px}',
    '.banner span{display:block;font-size:13px;color:#cfe3e9;margin-top:2px}',
    '.banner>svg{width:22px;height:22px;flex:none}',

    /* Kategoriler */
    '.clist{padding:0 8px}',
    '@media(min-width:760px){.clist{display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;padding:0 12px}}',
    '.li{display:flex;align-items:center;gap:12px;width:100%;padding:8px;border-radius:16px;text-align:left}',
    '.li:hover{background:var(--bg)}',
    '.li .im{width:52px;height:52px;border-radius:14px}',
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
  var isOpen = false, sel = -1, pushed = false;
  var onlyStock = false, sortMode = 'rel', shown = PAGE, view = null, tab = 'home';
  var TABS = [['home', 'Keşfet', 'compass'], ['calc', 'Toprak Hesapla', 'calc'], ['pages', 'Sayfalar', 'doc']];
  var BY_ID = {};

  function build() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'urun-arama-root';
    root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    root.innerHTML =
      '<style>' + CSS + '</style><div class="root">' +
      '<button class="fab hide" type="button" aria-label="Ürün bul"><span class="fi">' + I.search + '</span><span class="t">Ürün Bul</span></button>' +
      '<div class="ov"><div class="panel" role="dialog" aria-modal="true" aria-label="Ürün arama">' +
      '<div class="top"><button class="back" type="button" data-act="back" aria-label="Geri">' + I.back + '</button>' +
      '<label class="field">' + I.search +
      '<input type="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Ara">' +
      '<button class="clr" type="button" data-act="clear" aria-label="Temizle">' + I.x + '</button></label>' +
      '<button class="xbtn" type="button" data-act="close" aria-label="Kapat">' + I.x + '</button></div>' +
      '<div class="mid"><nav class="rail">' + TABS.map(function (t) {
        return '<button class="nav" type="button" data-act="tab" data-v="' + t[0] + '">' + I[t[2]] + '<span>' + t[1] + '</span></button>';
      }).join('') + '<div class="help"></div></nav>' +
      '<div class="main"><div class="tools"></div>' +
      '<div class="body"><div class="idle"><div class="pane home on"></div><div class="pane calc-p"></div><div class="pane pages"></div></div>' +
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
    $body = root.querySelector('.body');
    $cta = root.querySelector('.cta');
    $mfoot = root.querySelector('.mfoot');
    $sheet = root.querySelector('.sheet');
    $toast = root.querySelector('.toast');
    $q.placeholder = 'Ürün, marka veya kategori ara';

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
    root.addEventListener('input', function (e) { if (e.target !== $q) calcInput(e.target); });
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
    else if (act === 'tab') { if ($q.value) { $q.value = ''; render(); } view = null; renderIdle(); setTab(v); }
    else if (act === 'gocalc') { $q.value = ''; render(); setTab('calc'); }
    else if (act === 'add') openAdd(v);
    else if (act === 'vo') pickVariant(v);
    else if (act === 'sq') { SH.qty = Math.max(1, Math.min(99, SH.qty + (+v))); $sheet.querySelector('.qty input').value = SH.qty; }
    else if (act === 'shx') closeSheet();
    else if (act === 'shgo') doAdd();
    else if (act === 'shape' || act === 'unit' || act === 'qty') calcAction(act, v, b);
  }

  function tabOk(t) {
    if (t === 'calc') return calcEnabled();
    if (t === 'pages') return (CFG.pages || []).length > 0;
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

  function searchHref(q) {
    return STORE + (CFG.searchUrl || '/search?s={q}').replace('{q}', encodeURIComponent(q));
  }

  // ---- Keşfet ----
  function topCats() {
    var last = (CFG.categoryLast || []).map(fold);
    var rank = function (c) { return last.indexOf(c.f); };
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

  function renderIdle() {
    if (!$home) return;
    $pages.innerHTML = '<div class="h">Sayfalar</div><div class="list">' + pageRows() + '</div>';
    if (!DATA) { $home.innerHTML = '<div class="spin"></div>'; return; }
    if (view && CATS_BY_ID[view]) { $home.innerHTML = renderCat(CATS_BY_ID[view]); return; }
    view = null;
    var html = '';
    var rec = getRecent();
    if (rec.length) {
      html += '<div class="h">Son aramalar<button type="button" data-act="delall">Temizle</button></div><div class="recent">' +
        rec.map(function (t) {
          return '<span class="rc"><button type="button" data-act="q" data-v="' + esc(t) + '" style="display:flex;align-items:center;gap:6px">' + I.clock + esc(t) + '</button>' +
            '<button class="del" type="button" data-act="del" data-v="' + esc(t) + '" aria-label="Sil">' + I.x + '</button></span>';
        }).join('') + '</div>';
    }
    var pop = CFG.popular || [];
    if (pop.length) {
      html += '<div class="h">Sık arananlar</div><div class="trend">' +
        pop.map(function (t) { return '<button class="tq" type="button" data-act="q" data-v="' + esc(t) + '">' + I.trend + esc(t) + '</button>'; }).join('') +
        '</div>';
    }
    if (calcEnabled()) {
      html += '<button class="banner" type="button" data-act="gocalc"><span class="bi">' + I.calc + '</span><div class="tx"><b>Kaç litre toprak lazım?</b>' +
        '<span>Saksının ölçülerini gir, hemen hesaplayalım</span></div>' + I.arrow + '</button>';
    }
    var tops = topCats();
    if (tops.length) {
      html += '<div class="h">Kategoriler<small>' + DATA.items.length + ' ürün</small></div><div class="clist">' + tops.map(catRow).join('') + '</div>';
    }
    if ((CFG.pages || []).length) html += '<div class="mo"><div class="h">Sayfalar</div><div class="list">' + pageRows() + '</div></div>';
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
      $cta.innerHTML = '<a data-kind="all" data-name="' + esc(q) + '" href="' + esc(searchHref(q.trim())) + '"><span>' + r.items.length + ' sonucun tümünü gör</span>' + I.arrow + '</a>';
      $cta.classList.add('on');
    } else $cta.classList.remove('on');

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
      else { addRecent(q); track('all', q); location.href = searchHref(q); }
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

  // ---------------- Sepete ekle ----------------
  // Sitenin sepetine ekleme yöntemi site koduna bağlıdır. window.UrunAramaSepet(varyantId, adet, ürün)
  // tanımlıysa (Promise dönebilir) o kullanılır; yoksa ürün sayfası seçili varyantla açılır.
  var SH = { p: null, v: null, qty: 1 };
  function cartOn() { return (CFG.cart || {}).enabled !== false; }

  function openAdd(id) {
    var p = BY_ID[id];
    if (!p) return;
    var vs = (p.v || []).filter(function (v) { return v.id; });
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
      '<div class="sh-f"><div class="qty"><button type="button" data-act="sq" data-v="-1" aria-label="Azalt">' + I.minus + '</button>' +
      '<input value="1" inputmode="numeric" aria-label="Adet" readonly><button type="button" data-act="sq" data-v="1" aria-label="Artır">' + I.plus + '</button></div>' +
      '<button class="sh-go" type="button" data-act="shgo">' + I.cart + 'Sepete ekle</button></div></div>';
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
    if (!p || !v) return;
    track('add_to_cart', p.n);
    var fn = window.UrunAramaSepet;
    if (typeof fn === 'function') {
      Promise.resolve().then(function () { return fn(v.id, qty, { productId: p.id, slug: p.s, name: p.n }); }).then(function () {
        closeSheet();
        toast('Sepete eklendi');
      }, function () { location.href = url(p.s) + '?variantId=' + encodeURIComponent(v.id); });
      return;
    }
    location.href = url(p.s) + (v.id ? '?variantId=' + encodeURIComponent(v.id) : '');
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
    bed: { n: 'Bahçe yatağı', f: [['bw', 'En'], ['bl', 'Boy'], ['bd', 'Toprak derinliği', 'cm']], unit: 'm',
      v: function (x) { return x.bw * x.bl * x.bd; } }
  };
  var SHAPE_ICON = {
    cyl: svg('<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/>'),
    cone: svg('<ellipse cx="12" cy="5.5" rx="8.5" ry="2.5"/><path d="M3.5 5.5 6.3 18.3c.3 1.3 2.8 2.2 5.7 2.2s5.4-.9 5.7-2.2l2.8-12.8"/>'),
    box: svg('<path d="M4 8.5 8 5h12v10.5L16 19H4z"/><path d="M4 8.5h12V19M16 8.5 20 5"/>'),
    bed: svg('<path d="M2 12.5 6 9.5h16v4l-4 3.5H2z"/><path d="M2 12.5h16V17M18 12.5l4-3"/>')
  };
  var C = { shape: 'cyl', val: {}, unit: { cyl: 'cm', cone: 'cm', box: 'cm', bed: 'm' }, qty: 1, built: false };

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
    var one = s.v(x) / 1000;
    return { one: one, total: one * C.qty };
  }
  function fmtL(n) {
    return n.toLocaleString('tr-TR', { maximumFractionDigits: n < 10 ? 1 : 0 }) + ' litre';
  }

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
    var rec = Math.max(1, Math.ceil(r.total * (1 + extra / 100)));
    var html = '<div class="res"><div class="ic">' + I.bag + '</div><div><b>≈ ' + fmtL(rec) + '</b><span>' +
      (C.qty > 1 ? C.qty + ' adet × ' + fmtL(r.one) + ' = ' + fmtL(r.total) + ' net' : 'Net hacim ' + fmtL(r.total)) +
      ' · sulandıkça oturma payı %' + extra + ' eklendi</span></div></div>';
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
  function updateFab() {
    if ($fab) $fab.classList.toggle('hide', isOpen || !fabEnabled());
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

  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (isOurs(t) || !matches(t, SELECTOR)) return;
    var v = t.value;
    t.blur();
    open(v);
  }, true);

  // Sitenin kendi arama butonuna (büyüteç vb.) basılınca ikas'ın eski araması açılmadan bizimki açılsın.
  // data-trigger / config.json "triggers" ile seçici verilebilir; verilmezse "search"/"ara" içeren
  // buton ve bağlantılar otomatik tanınır (data-auto="off" ile kapatılır).
  var TRIGGER_RE = /(^|[^a-z])(search|arama|ara)([^a-z]|$)/;
  function attrs(n) {
    var c = n.getAttribute('class') || '';
    return fold([n.getAttribute('aria-label'), n.getAttribute('title'), n.id, c, n.getAttribute('data-testid'), n.getAttribute('name')].join(' '));
  }
  function triggerOf(el) {
    if (!el || !el.closest || isOurs(el)) return null;
    var sel = TRIGGER || (CFG.triggers || '');
    if (sel) { try { var t = el.closest(sel); if (t) return t; } catch (e) {} }
    if (ds.auto === 'off' || CFG.autoTrigger === false) return null;
    var n = el.closest('a,button,[role="button"]');
    if (n) {
      var path = (n.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, '');
      if (/^\/(search|arama)([?\/#]|$)/i.test(path) && !/[?&](s|q)=./.test(path)) return n;
      return TRIGGER_RE.test(attrs(n)) && !n.closest('form') ? n : null;
    }
    // İkon sarmalayıcı div/span (küçük ve içinde ikon olan)
    n = el.closest('[class*="search" i],[id*="search" i],[aria-label*="ara" i]');
    if (!n || /^(input|textarea|form|body|html)$/i.test(n.tagName) || n.querySelector('input,textarea')) return null;
    var r = n.getBoundingClientRect();
    return r.width <= 160 && r.height <= 100 && n.querySelector('svg,img,i') && TRIGGER_RE.test(attrs(n)) ? n : null;
  }
  ['pointerdown', 'mousedown', 'touchstart'].forEach(function (ev) {
    document.addEventListener(ev, function (e) { if (triggerOf(e.target)) e.stopPropagation(); }, true);
  });
  document.addEventListener('click', function (e) {
    var t = triggerOf(e.target);
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    open();
  }, true);

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
