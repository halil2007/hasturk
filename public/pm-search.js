/*! Mağaza arama widget'ı — ikas için. Tek satırla eklenir:
 *  <script src="https://hasturk-arama.halilc2007.workers.dev/pm-search.js" defer></script>
 *  İsteğe bağlı data-* ayarları:
 *   data-selector  hangi arama kutuları yakalansın (CSS seçici)
 *   data-trigger   tıklanınca aramayı açacak ek öğeler (örn. büyüteç ikonu)
 *   data-json      products.json adresi (varsayılan: script ile aynı klasör)
 *   data-store     mağaza adresi (varsayılan: bulunulan site)
 *   data-fab       "off" → sağ alttaki "Ürün Bul" butonunu gösterme
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
  var CACHE_KEY = 'ua-data-v3';
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
    hash: svg('<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>'),
    right: svg('<path d="m9 6 6 6-6 6"/>', 2.4),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 2.2),
    sprout: svg('<path d="M12 21v-8"/><path d="M12 13c0-4 3-6 7-6 0 4-3 6-7 6zM12 11C12 8 10 6 5 6c0 3 2 5 7 5z"/>'),
    compass: svg('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'),
    calc: svg('<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7M8.5 11h1M12 11h1M15.5 11h0M8.5 14.5h1M12 14.5h1M8.5 18h1M12 18h1M15.5 14.5V18"/>'),
    doc: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'),
    phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
    chat: svg('<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/><path d="M9 10.5c.5 2 2 3.5 4.5 4.5l1.2-1.2 1.8.8"/>'),
    minus: svg('<path d="M6 12h12"/>', 2.4),
    plus: svg('<path d="M12 6v12M6 12h12"/>', 2.4),
    bag: svg('<path d="M6 7h12l1.5 13h-15z"/><path d="M9 7V5.5a3 3 0 0 1 6 0V7"/><path d="M7.5 13c2 1.3 7 1.3 9 0"/>')
  };

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}',
    'button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}',
    'a{color:inherit;text-decoration:none}',
    'svg{display:block}',
    '.root{--pr:#b4441f;--prd:#8c3214;--soft:#fbeee8;--bg:#f7f2ec;--ln:#ece3da;--ink:#241b16;--mu:#7d716a;--ok:#2f855a;',
    ' font-family:inherit;color:var(--ink);-webkit-font-smoothing:antialiased;font-size:15px;line-height:1.35}',

    /* Ürün Bul butonu */
    '.fab{position:fixed;z-index:2147482990;bottom:calc(var(--fb,20px) + env(safe-area-inset-bottom,0px));right:20px;display:flex;align-items:center;gap:10px;',
    ' height:50px;padding:0 18px 0 7px;border-radius:16px;background:var(--pr);color:#fff;font-weight:700;font-size:15px;letter-spacing:.01em;',
    ' box-shadow:0 10px 26px rgba(90,35,10,.28);transition:padding .25s,gap .25s,transform .2s,opacity .2s}',
    '.fab .fi{width:36px;height:36px;border-radius:11px;background:rgba(255,255,255,.16);display:grid;place-items:center;flex:none}',
    '.fab .fi svg{width:19px;height:19px}',
    '.fab.left{right:auto;left:20px}',
    '.fab span.t{max-width:120px;overflow:hidden;white-space:nowrap;transition:max-width .25s,opacity .2s}',
    '.fab.mini{padding:0 7px;gap:0}.fab.mini span.t{max-width:0;opacity:0}',
    '.fab:hover{transform:translateY(-2px)}',
    '.fab.hide{opacity:0;pointer-events:none;transform:translateY(12px)}',
    '@media(max-width:759px){.fab{right:14px}.fab.left{left:14px}}',

    /* Panel */
    '.ov{position:fixed;inset:0;z-index:2147483000;display:none;background:rgba(36,24,18,.45);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px)}',
    '.ov.on{display:block}',
    '.panel{position:absolute;inset:0;background:#fff;display:flex;flex-direction:column;overflow:hidden;animation:up .22s cubic-bezier(.2,.8,.2,1)}',
    '@keyframes up{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}',
    '@media(min-width:760px){.panel{inset:6vh auto auto 50%;transform:translateX(-50%);width:min(900px,calc(100vw - 32px));height:min(80vh,720px);',
    ' border-radius:22px;box-shadow:0 30px 80px rgba(36,20,10,.3);animation:none}}',

    '.top{flex:none;display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid var(--ln)}',
    '.back,.xbtn{width:44px;height:44px;display:grid;place-items:center;border-radius:12px;flex:none}',
    '.back svg{width:24px;height:24px}',
    '.xbtn{display:none;background:var(--bg)}.xbtn svg{width:20px;height:20px}.xbtn:hover{background:var(--ln)}',
    '.field{flex:1;display:flex;align-items:center;gap:10px;height:48px;padding:0 6px 0 14px;border-radius:14px;border:1.5px solid var(--ln);background:#fff;min-width:0;transition:border-color .15s}',
    '.field:focus-within{border-color:var(--pr)}',
    '.field>svg{width:20px;height:20px;color:var(--mu);flex:none}',
    '.field input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:16px;color:var(--ink);-webkit-appearance:none;appearance:none}',
    '.field input::placeholder{color:#a0948c}',
    '.field input::-webkit-search-cancel-button{display:none}',
    '.clr{width:32px;height:32px;border-radius:50%;display:none;place-items:center;color:var(--mu)}',
    '.clr.on{display:grid}.clr svg{width:18px;height:18px}',
    '@media(min-width:760px){.back{display:none}.xbtn{display:grid}.top{padding:14px 14px 14px 16px}.field{height:50px}.field input{font-size:17px}}',

    '.mid{flex:1;display:flex;min-height:0}',
    '.main{flex:1;min-width:0;display:flex;flex-direction:column}',

    /* Masaüstü: sol menü */
    '.rail{display:none;flex:none;width:208px;flex-direction:column;gap:4px;padding:12px;background:var(--bg);border-right:1px solid var(--ln)}',
    '@media(min-width:760px){.rail{display:flex}}',
    '.nav{display:flex;align-items:center;gap:10px;height:44px;padding:0 12px;border-radius:12px;font-size:14.5px;font-weight:600;color:#5a4e47;text-align:left}',
    '.nav svg{width:19px;height:19px;flex:none}',
    '.nav:hover{background:rgba(0,0,0,.035)}',
    '.nav.on{background:#fff;color:var(--pr);box-shadow:0 1px 3px rgba(60,30,10,.12)}',
    '.typing .nav.on{background:none;color:#5a4e47;box-shadow:none}',
    '.help{margin-top:auto;padding:12px;border-radius:14px;background:#fff;border:1px solid var(--ln)}',
    '.help b{display:block;font-size:13px;margin-bottom:8px}',
    '.help a{display:flex;align-items:center;gap:8px;padding:7px 0;font-size:13.5px;font-weight:600;color:var(--ink)}',
    '.help a+a{border-top:1px dashed var(--ln)}',
    '.help a svg{width:17px;height:17px;color:var(--pr);flex:none}',

    /* Mobil: segmentli menü + alt iletişim çubuğu */
    '.seg{flex:none;display:flex;gap:4px;margin:10px 12px 0;padding:4px;border-radius:14px;background:var(--bg)}',
    '@media(min-width:760px){.seg{display:none}}',
    '.seg button{flex:1;height:38px;border-radius:10px;font-size:13.5px;font-weight:600;color:#6a5e57;display:flex;align-items:center;justify-content:center;gap:6px}',
    '.seg button svg{width:16px;height:16px}',
    '.seg button.on{background:#fff;color:var(--pr);box-shadow:0 1px 3px rgba(60,30,10,.14)}',
    '.typing .seg{display:none}',
    '.mfoot{flex:none;display:none;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--ln)}',
    '.mfoot.on{display:flex}',
    '@media(min-width:760px){.mfoot.on{display:none}}',
    '.typing .mfoot{display:none!important}',
    '.mfoot a{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;height:44px;border-radius:12px;border:1.5px solid var(--ln);font-weight:600;font-size:14px}',
    '.mfoot a svg{width:18px;height:18px;color:var(--pr)}',

    '.tools{flex:none;display:none;gap:8px;padding:10px 16px;border-bottom:1px solid var(--ln);overflow-x:auto;scrollbar-width:none;white-space:nowrap}',
    '.tools::-webkit-scrollbar{display:none}',
    '.typing .tools.on{display:flex}',
    '.opt{height:34px;padding:0 14px;border-radius:10px;border:1px solid var(--ln);font-size:13.5px;color:#4d423c;flex:none;display:flex;align-items:center;gap:7px}',
    '.opt.on{background:var(--pr);border-color:var(--pr);color:#fff}',
    '.opt i{width:8px;height:8px;border-radius:50%;background:var(--ok);display:block}',
    '.opt.on i{background:#fff}',
    '.sep{width:1px;background:var(--ln);margin:4px 2px;flex:none}',

    '.body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding-bottom:12px}',
    '.idle{display:block}.results{display:none}.typing .idle{display:none}.typing .results{display:block}',
    '.pane{display:none}.pane.on{display:block}',
    '.h{display:flex;align-items:center;justify-content:space-between;padding:18px 16px 8px;font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--mu)}',
    '.h small{font-weight:600;letter-spacing:0;text-transform:none;font-size:12.5px}',
    '.h button{font-size:12.5px;letter-spacing:0;text-transform:none;color:var(--pr);font-weight:600}',

    '.recent .row{display:flex;align-items:center}',
    '.recent .row>button.r{flex:1;min-width:0;display:flex;align-items:center;gap:12px;padding:10px 16px;text-align:left;font-size:15px}',
    '.recent .row svg{width:18px;height:18px;color:#b3a79f;flex:none}',
    '.recent .del{width:40px;height:40px;display:grid;place-items:center;color:#b3a79f;margin-right:6px}',
    '.recent .del svg{width:16px;height:16px}',
    '.recent .row:hover{background:var(--bg)}',

    '.trend{display:flex;flex-wrap:wrap;gap:8px;padding:2px 16px 6px}',
    '.tq{display:flex;align-items:center;gap:5px;height:36px;padding:0 14px 0 10px;border-radius:999px;border:1px solid var(--ln);font-size:14px;background:#fff}',
    '.tq svg{width:14px;height:14px;color:var(--pr)}',
    '.tq:hover{border-color:var(--pr);color:var(--pr)}',
    '.center{justify-content:center}',

    '.tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:4px 16px 8px}',
    '@media(min-width:760px){.tiles{grid-template-columns:1fr 1fr 1fr}}',
    '.tile{position:relative;display:block;border-radius:16px;overflow:hidden;background:var(--bg);text-align:left;min-width:0;aspect-ratio:4/3}',
    '.tile .im{position:absolute;inset:0;border-radius:0;width:auto;height:auto}',
    '.tile .im img{transition:transform .3s}',
    '.tile:hover .im img{transform:scale(1.04)}',
    '.tile .cap{position:absolute;left:0;right:0;bottom:0;padding:26px 12px 10px;background:linear-gradient(transparent,rgba(30,18,10,.72));color:#fff}',
    '.tile b{display:block;font-size:14.5px;font-weight:700;line-height:1.2}',
    '.tile small{font-size:12px;opacity:.85}',

    '.crumb{display:flex;align-items:center;gap:8px;padding:14px 12px 4px}',
    '.crumb button{display:flex;align-items:center;gap:4px;height:34px;padding:0 10px 0 6px;border-radius:10px;font-size:14px;color:var(--mu)}',
    '.crumb button:hover{background:var(--bg)}',
    '.crumb svg{width:18px;height:18px}',
    '.ctitle{padding:2px 16px 10px;font-size:21px;font-weight:800}',
    '.all-in{display:flex;align-items:center;justify-content:space-between;margin:0 16px 8px;padding:12px 14px;border-radius:12px;background:var(--pr);color:#fff;font-weight:600;font-size:14.5px}',
    '.all-in svg{width:18px;height:18px}',
    '.list .li{display:flex;align-items:center;gap:12px;width:100%;padding:9px 16px;text-align:left}',
    '.list .li:hover{background:var(--bg)}',
    '.list .li .im{width:46px;height:46px}',
    '.list .li span.n{flex:1;min-width:0;font-size:15px}',
    '.list .li small{color:var(--mu);font-size:13px}',
    '.list .li>svg{width:16px;height:16px;color:#c0b4ac;flex:none}',
    '.list .li .ico{width:40px;height:40px;border-radius:12px;background:var(--soft);display:grid;place-items:center;color:var(--pr);flex:none}',
    '.list .li .ico svg{width:19px;height:19px}',

    '.im{flex:none;border-radius:12px;background:var(--bg);overflow:hidden;display:grid;place-items:center;color:#c9a38c;position:relative}',
    '.im img{width:100%;height:100%;object-fit:cover;display:block}',
    '.im>svg{width:42%;height:42%}',

    '.cats{display:flex;gap:8px;padding:12px 16px 4px;overflow-x:auto;scrollbar-width:none}',
    '.cats::-webkit-scrollbar{display:none}',
    '.cc{flex:none;display:flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:999px;background:var(--soft);color:var(--prd);font-size:13.5px;font-weight:600;white-space:nowrap}',
    '.cc small{opacity:.7;font-weight:500}',
    '.cc:hover{background:#f6dccf}',

    '.item{display:flex;gap:14px;align-items:center;padding:10px 16px;position:relative}',
    '.item+.item:before{content:"";position:absolute;top:0;left:94px;right:16px;border-top:1px solid var(--ln)}',
    '.item:hover,.item.sel{background:var(--bg)}',
    '.item .im{width:64px;height:64px}',
    '.off{position:absolute;right:4px;bottom:4px;background:var(--ink);color:#fff;font-size:11px;font-weight:700;padding:2px 6px;border-radius:6px}',
    '.info{flex:1;min-width:0}',
    '.pname{font-size:15px;font-weight:500;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    'mark{background:none;color:inherit;font-weight:700;text-decoration:underline;text-decoration-color:var(--pr);text-decoration-thickness:2px;text-underline-offset:3px}',
    '.meta{margin-top:4px;font-size:12.5px;color:var(--mu);display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.st{display:inline-flex;align-items:center;gap:5px}',
    '.st i{width:7px;height:7px;border-radius:50%;background:var(--ok);display:block}',
    '.st.no{color:#b42318}.st.no i{background:#d9cfc8}',
    '.badge{background:var(--soft);color:var(--prd);font-weight:700;font-size:11px;padding:2px 7px;border-radius:6px}',
    '.price{text-align:right;flex:none;white-space:nowrap}',
    '.price b{display:block;font-size:15.5px;font-weight:800}',
    '.price s{display:block;font-size:12px;color:#a89c95}',
    '.price b.dsc{color:var(--pr)}',
    '.price small{display:block;font-size:11px;color:var(--mu);margin-top:1px}',
    '.more{display:block;margin:10px auto 4px;height:40px;padding:0 20px;border-radius:12px;border:1px solid var(--ln);font-size:14px;font-weight:600}',
    '.more:hover{background:var(--bg)}',

    '.cta{flex:none;display:none;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--ln);background:#fff}',
    '.typing .cta.on{display:block}',
    '.cta a{display:flex;align-items:center;justify-content:space-between;gap:8px;height:48px;padding:0 18px;border-radius:14px;background:var(--ink);color:#fff;font-weight:600;font-size:15px}',
    '.cta a span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.cta svg{width:18px;height:18px;flex:none}',

    '.empty{padding:40px 24px 12px;text-align:center}',
    '.empty .ic{width:56px;height:56px;border-radius:18px;background:var(--soft);display:grid;place-items:center;margin:0 auto 14px;color:var(--pr)}',
    '.empty .ic svg{width:26px;height:26px}',
    '.empty b{display:block;font-size:17px;margin-bottom:6px}',
    '.empty p{color:var(--mu);font-size:14.5px}',
    '.empty p a{color:var(--pr);font-weight:700}',
    '.spin{width:28px;height:28px;border:3px solid var(--ln);border-top-color:var(--pr);border-radius:50%;margin:48px auto;animation:sp .8s linear infinite}',
    '@keyframes sp{to{transform:rotate(360deg)}}',

    /* Aramada hesaplayıcı kısayolu */
    '.calc-card{display:flex;align-items:center;gap:12px;width:calc(100% - 32px);margin:12px 16px 0;padding:12px 14px;border-radius:14px;border:1.5px dashed #e5c3b3;background:#fffaf7;text-align:left}',
    '.calc-card>svg{width:22px;height:22px;color:var(--pr);flex:none}',
    '.calc-card div{flex:1}.calc-card b{display:block;font-size:15px}.calc-card span{font-size:13px;color:var(--mu)}',

    /* Toprak hesaplayıcı: adım adım */
    '.calc{padding:16px 16px 8px;max-width:640px}',
    '.c-head b{display:block;font-size:20px;font-weight:800}',
    '.c-head p{font-size:14px;color:var(--mu);margin-top:4px}',
    '.step{position:relative;margin-top:18px;padding-left:40px}',
    '.step:before{content:"";position:absolute;left:13px;top:30px;bottom:-14px;width:2px;background:var(--ln)}',
    '.step:last-child:before{display:none}',
    '.sn{position:absolute;left:0;top:0;width:28px;height:28px;border-radius:50%;background:var(--ink);color:#fff;font-size:13px;font-weight:700;display:grid;place-items:center}',
    '.step.done .sn{background:var(--pr)}',
    '.st-t{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:28px;font-size:15px;font-weight:700;margin-bottom:10px}',
    '.chips{display:flex;flex-wrap:wrap;gap:8px}',
    '@media(max-width:559px){.chips{display:grid;grid-template-columns:1fr 1fr}.sh{padding:0 10px 0 8px;font-size:13px;gap:6px}.fig svg{max-height:150px}}',
    '.sh{display:flex;align-items:center;gap:8px;height:40px;padding:0 14px 0 10px;border-radius:999px;border:1.5px solid var(--ln);font-size:14px;font-weight:600;background:#fff}',
    '.sh svg{width:20px;height:20px;color:var(--mu)}',
    '.sh:hover{border-color:#d9c3b6}',
    '.sh.on{border-color:var(--pr);background:var(--pr);color:#fff}.sh.on svg{color:#fff}',
    '.unit{display:flex;padding:3px;border-radius:10px;background:var(--bg)}',
    '.unit button{height:28px;padding:0 12px;border-radius:8px;font-size:13px;font-weight:700;color:var(--mu)}',
    '.unit button.on{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.12)}',
    '.dims{display:grid;gap:12px;padding:14px;border-radius:16px;border:1px solid var(--ln)}',
    '@media(min-width:560px){.dims{grid-template-columns:230px 1fr;align-items:center}}',
    '.fig svg{width:100%;height:auto;max-height:190px}',
    '.fig .body-f{fill:#f3e6da;stroke:#5b4033;stroke-width:1.8;stroke-linejoin:round}',
    '.fig .edge{fill:none;stroke:#5b4033;stroke-width:1.8}',
    '.fig .soil{fill:#6e4a36}',
    '.fig .dl{stroke:#9b8a80;stroke-width:1.3}',
    '.fig .pl rect{fill:#fff;stroke:#d8cbc2}',
    '.fig .pl text{fill:#5b4d45;font-size:13px;font-weight:700;text-anchor:middle}',
    '.fig .pl.v rect{fill:var(--ink);stroke:var(--ink)}.fig .pl.v text{fill:#fff}',
    '.fig .pl.on rect{fill:var(--pr);stroke:var(--pr)}.fig .pl.on text{fill:#fff}',
    '.fig .dm.on .dl{stroke:var(--pr);stroke-width:2}',
    '.inputs{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '.inp label{display:block;font-size:12.5px;font-weight:700;color:var(--mu);margin-bottom:5px}',
    '.inp div{display:flex;align-items:center;height:46px;border-radius:12px;background:var(--bg);padding:0 12px;border:1.5px solid transparent}',
    '.inp div:focus-within{border-color:var(--pr);background:#fff}',
    '.inp input,.qty input{flex:1;min-width:0;width:100%;border:0;outline:0;background:transparent;font:inherit;font-size:16px;font-weight:600;color:var(--ink)}',
    '.inp em{font-style:normal;font-size:13px;color:var(--mu);font-weight:600}',
    '.qty{display:flex;align-items:center;gap:4px;height:46px;border-radius:12px;background:var(--bg);padding:0 4px}',
    '.qty button{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.1)}',
    '.qty button svg{width:15px;height:15px}',
    '.qty input{text-align:center}',
    '.tip{grid-column:1/-1;font-size:12.5px;color:var(--mu)}',
    '.wait{padding:14px;border-radius:14px;background:var(--bg);color:var(--mu);font-size:14px}',
    '.res{display:flex;align-items:center;gap:14px;padding:16px;border-radius:16px;background:var(--ink);color:#fff}',
    '.res .ic{width:48px;height:48px;border-radius:14px;background:rgba(255,255,255,.1);display:grid;place-items:center;flex:none}',
    '.res .ic svg{width:26px;height:26px;color:#f3b89c}',
    '.res b{display:block;font-size:28px;font-weight:800;letter-spacing:-.01em;line-height:1.1}',
    '.res span{display:block;font-size:13px;color:#d9ccc4;margin-top:3px}',
    '.big{margin-top:10px;padding:10px 12px;border-radius:12px;background:var(--soft);color:var(--prd);font-size:13px}',
    '.big a{font-weight:700;text-decoration:underline}',
    '.go{margin-top:14px;font-size:13.5px;color:var(--mu)}',
    '.gocats{display:grid;gap:8px;margin-top:8px}',
    '@media(min-width:560px){.gocats{grid-template-columns:1fr 1fr}}',
    '.gc{display:flex;align-items:center;gap:10px;padding:8px 10px 8px 8px;border-radius:14px;border:1px solid var(--ln)}',
    '.gc:hover{border-color:var(--pr)}',
    '.gc .im{width:46px;height:46px}',
    '.gc .tx{flex:1;min-width:0}.gc b{display:block;font-size:14px;line-height:1.25}.gc small{font-size:12px;color:var(--mu)}',
    '.gc>svg{width:16px;height:16px;color:var(--pr);flex:none}',
    '.gc.first{border-color:var(--pr);background:#fffaf7}',
    '.ask{display:inline-flex;align-items:center;gap:6px;margin-top:12px;font-size:13.5px;font-weight:600;color:var(--pr)}',
    '.ask svg{width:16px;height:16px}'
  ].join('\n');

  var host, root, $wrap, $ov, $panel, $q, $clr, $rail, $seg, $tools, $res, $idle, $home, $calc, $pages, $body, $cta, $mfoot, $help, $fab;
  var isOpen = false, sel = -1, pushed = false;
  var onlyStock = false, sortMode = 'rel', shown = PAGE, view = null, tab = 'home';
  var TABS = [['home', 'Keşfet', 'compass', 'Keşfet'], ['calc', 'Toprak Hesapla', 'calc', 'Hesapla'], ['pages', 'Sayfalar', 'doc', 'Sayfalar']];

  function build() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'urun-arama-root';
    root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var navs = function (cls) {
      return TABS.map(function (t) {
        return '<button class="' + cls + '" type="button" data-act="tab" data-v="' + t[0] + '">' + I[t[2]] + '<span>' + (cls === 'sg' ? t[3] : t[1]) + '</span></button>';
      }).join('');
    };
    root.innerHTML =
      '<style>' + CSS + '</style><div class="root">' +
      '<button class="fab hide" type="button" aria-label="Ürün bul"><span class="fi">' + I.search + '</span><span class="t">Ürün Bul</span></button>' +
      '<div class="ov"><div class="panel" role="dialog" aria-modal="true" aria-label="Ürün arama">' +
      '<div class="top"><button class="back" type="button" data-act="close" aria-label="Kapat">' + I.back + '</button>' +
      '<label class="field">' + I.search +
      '<input type="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Ara">' +
      '<button class="clr" type="button" data-act="clear" aria-label="Temizle">' + I.x + '</button></label>' +
      '<button class="xbtn" type="button" data-act="close" aria-label="Kapat">' + I.x + '</button></div>' +
      '<div class="mid"><nav class="rail">' + navs('nav') + '<div class="help"></div></nav>' +
      '<div class="main"><div class="seg">' + navs('sg') + '</div>' +
      '<div class="tools"></div>' +
      '<div class="body"><div class="idle"><div class="pane home on"></div><div class="pane calc-p"></div><div class="pane pages"></div></div>' +
      '<div class="results" aria-live="polite"></div></div>' +
      '<div class="cta"></div><div class="mfoot"></div></div></div>' +
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
    $seg = root.querySelector('.seg');
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
    $q.placeholder = 'Ürün, marka veya kategori ara';

    $q.addEventListener('input', function () { shown = PAGE; render(); });
    $q.addEventListener('keydown', onKey);
    $fab.addEventListener('click', function () { open(); });
    $ov.addEventListener('click', function (e) { if (e.target === $ov) close(); });
    root.addEventListener('error', function (e) {
      var t = e.target;
      if (t && t.tagName === 'IMG' && t.parentNode) t.parentNode.innerHTML = I.sprout;
    }, true);
    root.addEventListener('click', onClick);
    root.addEventListener('input', function (e) { if (e.target !== $q) calcInput(e.target); });
    root.addEventListener('focusin', function (e) { calcFocus(e.target, true); });
    root.addEventListener('focusout', function (e) { calcFocus(e.target, false); });
    $panel.addEventListener('keydown', function (e) { if (e.key === 'Escape' && e.target !== $q) close(); });
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
    else if (act === 'clear') { $q.value = ''; render(); $q.focus(); }
    else if (act === 'q') { $q.value = v; shown = PAGE; render(); $q.focus(); }
    else if (act === 'del') { var f = fold(v); setRecent(getRecent().filter(function (x) { return fold(x) !== f; })); renderIdle(); }
    else if (act === 'delall') { setRecent([]); renderIdle(); }
    else if (act === 'cat') { view = v || null; renderIdle(); $body.scrollTop = 0; }
    else if (act === 'stock') { onlyStock = !onlyStock; shown = PAGE; render(); }
    else if (act === 'sort') { sortMode = v; shown = PAGE; render(); }
    else if (act === 'more') { shown += PAGE; render(); }
    else if (act === 'tab') { if ($q.value) { $q.value = ''; render(); } setTab(v); }
    else if (act === 'gocalc') { $q.value = ''; render(); setTab('calc'); }
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
    if (CFG.placeholder) $q.placeholder = CFG.placeholder;
    var fab = CFG.fab || {};
    $fab.querySelector('span.t').textContent = fab.text || 'Ürün Bul';
    $fab.classList.toggle('left', fab.side === 'left');
    if (fab.bottom != null) $wrap.style.setProperty('--fb', (+fab.bottom || 0) + 'px');
    updateFab();

    // İletişim: masaüstünde sol menünün altında, mobilde alt çubukta
    var wa = CFG.whatsapp ? '<a data-kind="whatsapp" data-name="whatsapp" target="_blank" rel="noopener" href="' + esc(waHref()) + '">' + I.chat + '<span>WhatsApp</span></a>' : '';
    var tel = CFG.phone ? '<a data-kind="phone" data-name="phone" href="tel:' + esc(CFG.phone.replace(/[^\d+]/g, '')) + '">' + I.phone + '<span>' + esc(CFG.phone) + '</span></a>' : '';
    $help.innerHTML = wa || tel ? '<b>Yardım mı lazım?</b>' + wa + tel : '';
    $help.style.display = wa || tel ? '' : 'none';
    $mfoot.innerHTML = wa + (CFG.phone ? '<a data-kind="phone" data-name="phone" href="tel:' + esc(CFG.phone.replace(/[^\d+]/g, '')) + '">' + I.phone + '<span>Bizi arayın</span></a>' : '');
    $mfoot.classList.toggle('on', !!(wa || tel));
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

  // ---- Keşfet: son aramalar, çok arananlar, kategoriler ----
  function topCats() {
    var last = (CFG.categoryLast || []).map(fold);
    var rank = function (c) { return last.indexOf(c.f); };
    return DATA.cats.filter(function (c) { return !c.p || !CATS_BY_ID[c.p]; })
      .sort(function (a, b) { return rank(a) - rank(b) || b.k - a.k; });
  }

  function renderIdle() {
    if (!$home) return;
    renderPages();
    if (!DATA) { $home.innerHTML = '<div class="spin"></div>'; return; }
    if (view && CATS_BY_ID[view]) { $home.innerHTML = renderCat(CATS_BY_ID[view]); return; }
    view = null;
    var html = '';
    var rec = getRecent();
    if (rec.length) {
      html += '<div class="h">Son aramaların<button type="button" data-act="delall">Temizle</button></div><div class="recent">' +
        rec.map(function (t) {
          return '<div class="row"><button class="r" type="button" data-act="q" data-v="' + esc(t) + '">' + I.clock + esc(t) + '</button>' +
            '<button class="del" type="button" data-act="del" data-v="' + esc(t) + '" aria-label="Sil">' + I.x + '</button></div>';
        }).join('') + '</div>';
    }
    var pop = CFG.popular || [];
    if (pop.length) {
      html += '<div class="h">Sık aranan</div><div class="trend">' +
        pop.map(function (t) { return '<button class="tq" type="button" data-act="q" data-v="' + esc(t) + '">' + I.hash + esc(t) + '</button>'; }).join('') +
        '</div>';
    }
    var tops = topCats();
    if (tops.length) {
      html += '<div class="h">Kategoriler<small>' + DATA.items.length + ' ürün</small></div><div class="tiles">' +
        tops.map(function (c) {
          var inner = thumb(c.img, 360) + '<div class="cap"><b>' + esc(c.n) + '</b><small>' + c.k + ' ürün</small></div>';
          return KIDS[c.id]
            ? '<button class="tile" type="button" data-act="cat" data-v="' + esc(c.id) + '">' + inner + '</button>'
            : '<a class="tile" data-kind="category" data-name="' + esc(c.n) + '" href="' + esc(url(c.s)) + '">' + inner + '</a>';
        }).join('') + '</div>';
    }
    $home.innerHTML = html;
  }

  function renderPages() {
    var pages = CFG.pages || [];
    $pages.innerHTML = '<div class="h">Sayfalar</div><div class="list">' + pages.map(function (pg) {
      return '<a class="li" data-kind="page" data-name="' + esc(pg.title) + '" href="' + esc(pageHref(pg.url)) + '">' +
        '<span class="ico">' + I.doc + '</span><span class="n">' + esc(pg.title) + '</span>' + I.right + '</a>';
    }).join('') + '</div>';
  }

  function renderCat(c) {
    var parent = c.p && CATS_BY_ID[c.p];
    var html = '<div class="crumb"><button type="button" data-act="cat" data-v="' + (parent ? esc(parent.id) : '') + '">' + I.back +
      esc(parent ? parent.n : 'Tüm kategoriler') + '</button></div>' +
      '<div class="ctitle">' + esc(c.n) + '</div>' +
      '<a class="all-in" data-kind="category" data-name="' + esc(c.n) + '" href="' + esc(url(c.s)) + '"><span>Tüm ' + esc(c.n) + ' (' + c.k + ')</span>' + I.arrow + '</a>' +
      '<div class="list">';
    html += (KIDS[c.id] || []).slice().sort(function (a, b) { return b.k - a.k; }).map(function (s) {
      var inner = thumb(s.img, 180) + '<span class="n">' + esc(s.n) + '<br><small>' + s.k + ' ürün</small></span>' + I.right;
      return KIDS[s.id]
        ? '<button class="li" type="button" data-act="cat" data-v="' + esc(s.id) + '">' + inner + '</button>'
        : '<a class="li" data-kind="category" data-name="' + esc(s.n) + '" href="' + esc(url(s.s)) + '">' + inner + '</a>';
    }).join('');
    return html + '</div>';
  }

  // ---- Sonuçlar ----
  function price(p) { return p.d != null ? p.d : p.p; }

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
    var badges = CFG.badges || {};
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
      '<button class="opt' + (onlyStock ? ' on' : '') + '" type="button" data-act="stock"><i></i>Stoktakiler</button><span class="sep"></span>' +
      [['rel', 'Önerilen'], ['asc', 'Fiyat artan'], ['desc', 'Fiyat azalan']].map(function (o) {
        return '<button class="opt' + (sortMode === o[0] ? ' on' : '') + '" type="button" data-act="sort" data-v="' + o[0] + '">' + o[1] + '</button>';
      }).join('');
    $tools.classList.toggle('on', r.items.length > 1);

    if (r.items.length) {
      $cta.innerHTML = '<a data-kind="all" data-name="' + esc(q) + '" href="' + esc(searchHref(q.trim())) + '"><span>“' + esc(q.trim()) +
        '” için ' + r.items.length + ' sonucun tümü</span>' + I.arrow + '</a>';
      $cta.classList.add('on');
    } else $cta.classList.remove('on');

    if (calcEnabled() && r.tokens.some(function (t) { return /^(hacim|litre|kac|hesap|olcu|metrekup)/.test(t); })) {
      html += '<button class="calc-card" type="button" data-act="gocalc">' + I.calc +
        '<div><b>Toprak hesaplayıcı</b><span>Saksının ölçülerini gir, kaç litre gerektiğini öğren</span></div>' + I.arrow + '</button>';
    }
    var pages = (CFG.pages || []).filter(function (pg) {
      var f = fold(pg.title);
      return r.tokens.every(function (t) { return words(f).some(function (w) { return w.indexOf(t) === 0; }); });
    });
    if (pages.length) {
      html += '<div class="list" style="padding-top:8px">' + pages.slice(0, 3).map(function (pg) {
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
          : '<div class="trend center">' + sugg.map(function (t) { return '<button class="tq" type="button" data-act="q" data-v="' + esc(t) + '">' + I.hash + esc(t) + '</button>'; }).join('') + '</div>');
      if (!filtered) track('no_results', q);
      return;
    }

    if (r.cats.length) {
      html += '<div class="cats">' + r.cats.slice(0, 6).map(function (c) {
        return '<a class="cc" data-kind="category" data-name="' + esc(c.n) + '" href="' + esc(url(c.s)) + '">' + esc(c.n) + ' <small>' + c.k + '</small></a>';
      }).join('') + '</div>';
    }
    if (items.length) {
      html += '<div class="h">Ürünler<small>' + items.length + ' sonuç</small></div>';
      html += items.slice(0, shown).map(function (x) {
        var p = x.p;
        var off = p.d != null && p.p ? Math.round((1 - p.d / p.p) * 100) : 0;
        var tagBadges = (p.t || []).filter(function (t) { return badges[t]; })
          .map(function (t) { return '<span class="badge">' + esc(badges[t]) + '</span>'; }).join('');
        var pr = p.p == null ? '' :
          (p.d != null ? '<s>' + tl(p.p) + '</s><b class="dsc">' + tl(p.d) + '</b>' : '<b>' + tl(p.p) + '</b>') +
          (p.multi ? '<small>başlayan fiyatlarla</small>' : '');
        return '<a class="item" data-kind="product" data-name="' + esc(p.n) + '" href="' + esc(url(p.s)) + '">' +
          thumb(p.img, 180, off >= 1 ? '<span class="off">-%' + off + '</span>' : '') +
          '<div class="info"><div class="pname">' + highlight(p.n, p.nf, x.h) + '</div>' +
          '<div class="meta">' + (p.st ? '<span class="st"><i></i>Stokta</span>' : '<span class="st no"><i></i>Tükendi</span>') +
          '<span>' + esc(p.b && p.b !== p.cn ? p.b : p.cn) + '</span>' + tagBadges + '</div></div>' +
          '<div class="price">' + pr + '</div></a>';
      }).join('');
      if (items.length > shown) {
        html += '<button class="more" type="button" data-act="more">Daha fazla göster (' + (items.length - shown) + ')</button>';
      }
    }
    $res.innerHTML = html;
  }

  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    var els = [].slice.call($res.querySelectorAll('.item'));
    if (e.key === 'ArrowDown') sel = Math.min(sel + 1, els.length - 1);
    else if (e.key === 'ArrowUp') sel = Math.max(sel - 1, -1);
    else if (e.key === 'Enter') {
      e.preventDefault();
      var q = $q.value.trim();
      if (!q) return;
      if (sel >= 0 && els[sel]) els[sel].click();
      else { addRecent(q); track('all', q); location.href = searchHref(q); }
      return;
    } else return;
    e.preventDefault();
    els.forEach(function (el, i) { el.classList.toggle('sel', i === sel); });
    if (els[sel]) els[sel].scrollIntoView({ block: 'nearest' });
  }

  function track(kind, name) {
    try {
      (window.dataLayer = window.dataLayer || []).push({ event: 'urun_arama', search_action: kind, search_term: $q.value, search_target: name });
    } catch (e) {}
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
        '<div class="c-head"><b>Toprak hesaplayıcı</b><p>Üç adımda ne kadar toprak alacağını öğren, sonra uygun toprağa geç.</p></div>' +
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
      return '<div class="inp"><label for="ua-' + f[0] + '">' + esc(f[1]) + '</label><div>' +
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
        html += '<p class="go">Şimdi ihtiyacına uygun toprağı seç; ürün sayfasında litre seçeneğini <b>' + fmtL(rec) + '</b>\'yi karşılayacak şekilde seçebilirsin.</p>' +
          '<div class="gocats">' + cats.map(function (c, i) {
            return '<a class="gc' + (i === 0 ? ' first' : '') + '" data-kind="calc_category" data-name="' + esc(c.n) + '" href="' + esc(url(c.s)) + '">' +
              thumb(c.img, 180) + '<div class="tx"><b>' + esc(c.n) + '</b><small>' + c.k + ' ürün</small></div>' + I.arrow + '</a>';
          }).join('') + '</div>';
      }
    }
    if (CFG.whatsapp) {
      html += '<a class="ask" target="_blank" rel="noopener" href="' + esc(waHref('Merhaba, ' + SHAPES[C.shape].n.toLocaleLowerCase('tr-TR') + ' için yaklaşık ' + rec + ' litre toprak gerekiyor. Hangi toprağı önerirsiniz?')) + '">' +
        I.chat + 'Hangi toprak olmalı? Bize sor</a>';
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

  if (TRIGGER) {
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest(TRIGGER) : null;
      if (!t || isOurs(t)) return;
      e.preventDefault();
      e.stopPropagation();
      open();
    }, true);
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
