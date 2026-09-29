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
  var CACHE_KEY = 'ua-data-v2';
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
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>', 2.4),
    clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
    trend: svg('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
    right: svg('<path d="m9 6 6 6-6 6"/>', 2.4),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 2.2),
    leaf: svg('<path d="M12 21c-5 0-8-3.5-8-8 6 0 8 3 8 8zm0 0c0-6 3-9 8-9 0 5-3 9-8 9zM12 13V5"/>'),
    grid: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
    phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
    chat: svg('<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/><path d="M9 10.5c.5 2 2 3.5 4.5 4.5l1.2-1.2 1.8.8"/>'),
    ruler: svg('<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>'),
    doc: svg('<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>'),
    minus: svg('<path d="M6 12h12"/>', 2.4),
    plus: svg('<path d="M12 6v12M6 12h12"/>', 2.4)
  };

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}',
    'button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}',
    'a{color:inherit;text-decoration:none}',
    'svg{display:block}',
    '.root{--pr:#12664f;--ac:#e8590c;--ink:#1c2321;--mu:#6b7572;--ln:#ebeeed;--bg:#f6f7f6;--soft:#e8f2ee;',
    ' font-family:inherit;color:var(--ink);-webkit-font-smoothing:antialiased;font-size:15px;line-height:1.35}',
    '@supports (color:color-mix(in srgb,red,blue)){.root{--soft:color-mix(in srgb,var(--pr) 10%,#fff)}}',

    /* Ürün Bul butonu */
    '.fab{position:fixed;z-index:2147482990;bottom:calc(var(--fb,20px) + env(safe-area-inset-bottom,0px));right:20px;display:flex;align-items:center;gap:10px;',
    ' height:52px;padding:0 20px 0 16px;border-radius:26px;background:var(--pr);color:#fff;font-weight:600;font-size:15px;',
    ' box-shadow:0 8px 24px rgba(0,0,0,.18),0 2px 6px rgba(0,0,0,.12);transition:padding .25s,gap .25s,transform .2s,opacity .2s}',
    '.fab.left{right:auto;left:20px}',
    '.fab svg{width:21px;height:21px;flex:none}',
    '.fab span{max-width:120px;overflow:hidden;white-space:nowrap;transition:max-width .25s,opacity .2s}',
    '.fab.mini{padding:0 15px;gap:0}.fab.mini span{max-width:0;opacity:0}',
    '.fab:hover{transform:translateY(-2px)}',
    '.fab.hide{opacity:0;pointer-events:none;transform:translateY(12px)}',
    '@media(max-width:759px){.fab{right:16px;height:50px}.fab.left{left:16px}}',

    /* Panel */
    '.ov{position:fixed;inset:0;z-index:2147483000;display:none;background:rgba(18,26,23,.42);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}',
    '.ov.on{display:block}',
    '.panel{position:absolute;inset:0;background:#fff;display:flex;flex-direction:column;overflow:hidden;animation:up .22s cubic-bezier(.2,.8,.2,1)}',
    '@keyframes up{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}',
    '@media(min-width:760px){.panel{inset:7vh auto auto 50%;transform:translateX(-50%);width:min(720px,calc(100vw - 32px));max-height:82vh;',
    ' border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.28);animation:none}}',

    '.top,.tools,.cta,.foot{flex:none}',
    '.top{display:flex;align-items:center;gap:6px;padding:10px 12px;border-bottom:1px solid var(--ln)}',
    '.back{width:44px;height:44px;display:grid;place-items:center;border-radius:12px;flex:none}',
    '.back svg{width:24px;height:24px}',
    '.field{flex:1;display:flex;align-items:center;gap:10px;height:48px;padding:0 6px 0 14px;border-radius:14px;background:var(--bg);min-width:0}',
    '.field>svg{width:20px;height:20px;color:var(--pr);flex:none}',
    '.field input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:16px;color:var(--ink);-webkit-appearance:none;appearance:none}',
    '.field input::placeholder{color:#8b9491}',
    '.field input::-webkit-search-cancel-button{display:none}',
    '.clr{width:32px;height:32px;border-radius:50%;display:none;place-items:center;color:var(--mu)}',
    '.clr.on{display:grid}.clr svg{width:18px;height:18px}',
    '.esc{display:none;height:30px;padding:0 10px;border:1px solid var(--ln);border-radius:8px;font-size:12px;font-weight:600;color:var(--mu);margin-left:6px}',
    '@media(min-width:760px){.back{display:none}.esc{display:block}.top{padding:14px 16px}.field{height:52px;background:transparent;padding-left:4px}.field input{font-size:18px}}',

    '.tools{display:none;gap:8px;padding:10px 16px;border-bottom:1px solid var(--ln);overflow-x:auto;scrollbar-width:none;white-space:nowrap}',
    '.tools::-webkit-scrollbar{display:none}',
    '.typing .tools.on{display:flex}',
    '.opt{height:34px;padding:0 14px;border-radius:17px;border:1px solid var(--ln);font-size:13.5px;color:#3b4542;flex:none;display:flex;align-items:center;gap:7px}',
    '.opt.on{background:var(--ink);border-color:var(--ink);color:#fff}',
    '.opt i{width:8px;height:8px;border-radius:50%;background:#22a06b;display:block}',
    '.sep{width:1px;background:var(--ln);margin:4px 2px;flex:none}',

    '.body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding-bottom:8px}',
    '.idle{display:block}.results{display:none}.typing .idle{display:none}.typing .results{display:block}',
    '.h{display:flex;align-items:center;justify-content:space-between;padding:18px 16px 8px;font-size:13px;font-weight:700;color:var(--ink)}',
    '.h small{font-weight:500;color:var(--mu);font-size:12.5px}',
    '.h button{font-size:12.5px;color:var(--mu);font-weight:500}',

    '.recent a,.recent button.r{display:flex;align-items:center;gap:12px;width:100%;padding:10px 16px;text-align:left;font-size:15px}',
    '.recent .row{display:flex;align-items:center}',
    '.recent .row>button.r{flex:1;min-width:0}',
    '.recent .row svg{width:18px;height:18px;color:#9aa3a0;flex:none}',
    '.recent .del{width:40px;height:40px;display:grid;place-items:center;color:#9aa3a0;margin-right:6px}',
    '.recent .del svg{width:16px;height:16px}',
    '.recent .row:hover{background:var(--bg)}',

    '.trend{display:flex;flex-wrap:wrap;gap:8px;padding:2px 16px 6px}',
    '.tq{display:flex;align-items:center;gap:6px;height:36px;padding:0 14px;border-radius:10px;background:var(--bg);font-size:14px}',
    '.tq svg{width:15px;height:15px;color:var(--pr)}',
    '.tq:hover{background:var(--soft)}',

    '.tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:4px 16px 8px}',
    '@media(min-width:760px){.tiles{grid-template-columns:1fr 1fr 1fr}}',
    '.tile{display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--ln);border-radius:14px;text-align:left;min-width:0;transition:border-color .15s,background .15s}',
    '.tile:hover{border-color:var(--pr);background:var(--soft)}',
    '.tile .im{width:48px;height:48px}',
    '.tile b{display:block;font-size:14px;font-weight:600;line-height:1.25;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
    '.tile small{font-size:12px;color:var(--mu)}',
    '.tile div{min-width:0}',

    '.crumb{display:flex;align-items:center;gap:8px;padding:14px 12px 6px}',
    '.crumb button{display:flex;align-items:center;gap:4px;height:34px;padding:0 10px 0 6px;border-radius:10px;font-size:14px;color:var(--mu)}',
    '.crumb button:hover{background:var(--bg)}',
    '.crumb svg{width:18px;height:18px}',
    '.ctitle{padding:2px 16px 10px;font-size:20px;font-weight:700}',
    '.all-in{display:flex;align-items:center;justify-content:space-between;margin:0 16px 8px;padding:12px 14px;border-radius:12px;background:var(--soft);color:var(--pr);font-weight:600;font-size:14.5px}',
    '.all-in svg{width:18px;height:18px}',
    '.list .li{display:flex;align-items:center;gap:12px;width:100%;padding:9px 16px;text-align:left}',
    '.list .li:hover{background:var(--bg)}',
    '.list .li .im{width:44px;height:44px}',
    '.list .li span{flex:1;min-width:0;font-size:15px}',
    '.list .li small{color:var(--mu);font-size:13px}',
    '.list .li>svg{width:16px;height:16px;color:#aab2af;flex:none}',

    '.im{flex:none;border-radius:10px;background:var(--bg);overflow:hidden;display:grid;place-items:center;color:var(--pr);position:relative}',
    '.im img{width:100%;height:100%;object-fit:cover;display:block}',
    '.im svg{width:45%;height:45%;opacity:.55}',

    '.cats{display:flex;gap:8px;padding:12px 16px 4px;overflow-x:auto;scrollbar-width:none}',
    '.cats::-webkit-scrollbar{display:none}',
    '.cc{flex:none;display:flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:10px;border:1px solid var(--ln);font-size:13.5px;white-space:nowrap}',
    '.cc small{color:var(--mu)}',
    '.cc svg{width:15px;height:15px;color:var(--pr)}',
    '.cc:hover,.cc.sel{border-color:var(--pr);background:var(--soft)}',

    '.item{display:flex;gap:14px;align-items:center;padding:10px 16px;border-radius:0;position:relative}',
    '.item+.item:before{content:"";position:absolute;top:0;left:94px;right:16px;border-top:1px solid var(--ln)}',
    '.item:hover,.item.sel{background:var(--bg)}',
    '.item .im{width:64px;height:64px;border-radius:12px}',
    '.off{position:absolute;left:4px;top:4px;background:var(--ac);color:#fff;font-size:11px;font-weight:700;padding:2px 6px;border-radius:6px}',
    '.info{flex:1;min-width:0}',
    '.pname{font-size:15px;font-weight:500;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    'mark{background:none;color:var(--pr);font-weight:700}',
    '.meta{margin-top:4px;font-size:12.5px;color:var(--mu);display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.st{display:inline-flex;align-items:center;gap:5px}',
    '.st i{width:7px;height:7px;border-radius:50%;background:#22a06b;display:block}',
    '.st.no{color:#b42318}.st.no i{background:#d0d5d3}',
    '.badge{background:#fff4e6;color:#b4410a;font-weight:600;font-size:11px;padding:2px 7px;border-radius:6px}',
    '.price{text-align:right;flex:none;white-space:nowrap}',
    '.price b{display:block;font-size:15.5px;font-weight:700}',
    '.price s{display:block;font-size:12px;color:#9aa3a0}',
    '.price small{display:block;font-size:11px;color:var(--mu);margin-top:1px}',
    '.more{display:block;margin:10px auto 4px;height:40px;padding:0 20px;border-radius:20px;border:1px solid var(--ln);font-size:14px;font-weight:600}',
    '.more:hover{background:var(--bg)}',

    '.cta{display:none;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--ln);background:#fff}',
    '.typing .cta.on{display:block}',
    '.cta a{display:flex;align-items:center;justify-content:center;gap:8px;height:48px;border-radius:14px;background:var(--pr);color:#fff;font-weight:600;font-size:15px}',
    '.cta svg{width:18px;height:18px}',

    '.empty{padding:40px 24px 12px;text-align:center}',
    '.empty .ic{width:56px;height:56px;border-radius:50%;background:var(--bg);display:grid;place-items:center;margin:0 auto 14px;color:var(--mu)}',
    '.empty .ic svg{width:26px;height:26px}',
    '.empty b{display:block;font-size:17px;margin-bottom:6px}',
    '.empty p{color:var(--mu);font-size:14.5px}',
    '.center{justify-content:center}',
    '.spin{width:28px;height:28px;border:3px solid var(--ln);border-top-color:var(--pr);border-radius:50%;margin:48px auto;animation:sp .8s linear infinite}',
    '@keyframes sp{to{transform:rotate(360deg)}}',

    '.foot{display:none;align-items:center;gap:16px;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--ln);font-size:12.5px;color:var(--mu);background:#fff}',
    '.foot.on{display:flex}',
    '.typing .cta.on{padding-bottom:10px}',
    '.keys{display:none;gap:14px;margin-left:auto}',
    '@media(min-width:760px){.foot{display:flex}.keys{display:flex}.typing .keys{display:none}}',
    '.keys kbd{font:inherit;font-size:11px;font-weight:600;border:1px solid var(--ln);border-bottom-width:2px;border-radius:5px;padding:0 5px;margin-right:4px;color:var(--ink)}',
    '.contact{display:flex;gap:8px;min-width:0}',
    '.contact a{display:flex;align-items:center;gap:7px;height:40px;padding:0 14px;border-radius:12px;font-weight:600;font-size:13.5px;white-space:nowrap}',
    '.contact .wa{background:#1f9d55;color:#fff}',
    '.contact .tel{border:1px solid var(--ln);color:var(--ink)}',
    '.contact svg{width:18px;height:18px}',
    '.contact .tel svg{color:var(--pr)}',

    /* Sekmeler */
    '.tabs{display:flex;gap:4px;padding:0 12px;border-bottom:1px solid var(--ln);overflow-x:auto;scrollbar-width:none;flex:none}',
    '.tabs::-webkit-scrollbar{display:none}',
    '.typing .tabs{display:none}',
    '.tab{display:flex;align-items:center;gap:7px;height:44px;padding:0 10px;font-size:14px;font-weight:600;color:var(--mu);white-space:nowrap;border-bottom:2px solid transparent;margin-bottom:-1px}',
    '.tab svg{width:17px;height:17px}',
    '.tab:hover{color:var(--ink)}',
    '.tab.on,.tab.on:hover{color:var(--pr);border-bottom-color:var(--pr)}',
    '@media(max-width:759px){.tabs{padding:0 6px;gap:0}.tab{flex:1;justify-content:center;padding:0 4px;font-size:13.5px;gap:6px}}',
    '.pane{display:none}.pane.on{display:block}',

    /* Sayfalar */
    '.pg{padding:8px 0}',
    '.list .li .ico{width:40px;height:40px;border-radius:10px;background:var(--bg);display:grid;place-items:center;color:var(--pr);flex:none}',
    '.list .li .ico svg{width:20px;height:20px}',

    /* Aramada hesaplayıcı kısayolu */
    '.calc-card{display:flex;align-items:center;gap:12px;width:calc(100% - 32px);margin:12px 16px 0;padding:12px 14px;border-radius:14px;background:var(--soft);color:var(--pr);text-align:left}',
    '.calc-card>svg{width:20px;height:20px;flex:none}',
    '.calc-card div{flex:1}.calc-card b{display:block;font-size:15px}.calc-card span{font-size:13px;color:var(--mu)}',

    /* Hacim hesaplayıcı */
    '.calc{padding:16px}',
    '.c-in{display:flex;gap:12px;align-items:flex-start;margin-bottom:14px}',
    '.c-in .ic{width:40px;height:40px;border-radius:12px;background:var(--soft);color:var(--pr);display:grid;place-items:center;flex:none}',
    '.c-in .ic svg{width:20px;height:20px}',
    '.c-in b{display:block;font-size:16px}.c-in p{font-size:13.5px;color:var(--mu);margin-top:2px}',
    '.shp{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}',
    '@media(min-width:760px){.shp{grid-template-columns:repeat(4,1fr)}}',
    '.sh{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid var(--ln);border-radius:12px;font-size:13.5px;font-weight:600;text-align:left}',
    '.sh svg{width:24px;height:24px;flex:none;color:var(--mu)}',
    '.sh:hover{border-color:#c9d3cf}',
    '.sh.on{border-color:var(--pr);background:var(--soft);color:var(--pr)}.sh.on svg{color:var(--pr)}',
    '.c-main{display:grid;gap:14px;margin-top:14px}',
    '@media(min-width:760px){.c-main{grid-template-columns:1fr 1fr;align-items:start}.c-fig{order:2}}',
    '.c-fig{border-radius:14px;background:var(--bg);padding:8px}',
    '.c-fig svg{width:100%;height:auto;max-height:220px}',
    '@media(max-width:759px){.c-fig svg{max-height:170px}}',
    '.c-fig .ln{fill:#fff;stroke:#2b3330;stroke-width:2;stroke-linejoin:round}',
    '.c-fig .ln2{fill:none;stroke:#2b3330;stroke-width:2}',
    '.c-fig .soil{fill:#8b5e3c}',
    '.c-fig .dm line{stroke:var(--pr);stroke-width:1.6;stroke-dasharray:4 3}',
    '.c-fig .dm .cap{fill:var(--pr)}',
    '.c-fig .dm .bd{fill:var(--pr)}',
    '.c-fig .dm .lt{fill:#fff;font-size:12px;font-weight:700;text-anchor:middle}',
    '.c-fig .dm .dv{fill:var(--ink);font-size:12px;font-weight:600}',
    '.c-fig .dm.on line{stroke:var(--ac);stroke-width:2.4;stroke-dasharray:none}',
    '.c-fig .dm.on .bd,.c-fig .dm.on .cap{fill:var(--ac)}',
    '.cf{margin-bottom:12px}',
    '.cf label{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;margin-bottom:6px}',
    '.cf label i{width:20px;height:20px;border-radius:50%;background:var(--pr);color:#fff;font-style:normal;font-size:11px;display:grid;place-items:center}',
    '.ci{display:flex;align-items:center;height:46px;border:1.5px solid var(--ln);border-radius:12px;padding:0 4px 0 12px;background:#fff}',
    '.ci:focus-within{border-color:var(--pr)}',
    '.ci input,.stp input{flex:1;min-width:0;border:0;outline:0;font:inherit;font-size:16px;background:transparent;color:var(--ink)}',
    '.un{display:flex;background:var(--bg);border-radius:9px;padding:3px}',
    '.un button{height:30px;padding:0 10px;border-radius:7px;font-size:13px;font-weight:600;color:var(--mu)}',
    '.un button.on{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(0,0,0,.12)}',
    '.cq{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:4px}',
    '.cq span{font-size:13.5px;font-weight:600}',
    '.stp{display:flex;align-items:center;height:42px;border:1.5px solid var(--ln);border-radius:12px;width:132px}',
    '.stp button{width:40px;height:40px;display:grid;place-items:center;color:var(--ink)}',
    '.stp button svg{width:16px;height:16px}',
    '.stp input{text-align:center;width:40px}',
    '.c-tip{font-size:12.5px;color:var(--mu);margin-top:10px}',
    '.c-hint{margin-top:14px;padding:18px;border:1.5px dashed var(--ln);border-radius:14px;text-align:center;color:var(--mu);font-size:14px}',
    '.c-res{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}',
    '.c-res>div{border-radius:14px;padding:14px}',
    '.c-big{background:var(--pr);color:#fff}',
    '.c-rec{background:var(--soft);color:var(--pr)}',
    '.c-res small{display:block;font-size:12px;font-weight:600;opacity:.85}',
    '.c-res b{display:block;font-size:26px;font-weight:800;margin:2px 0;letter-spacing:-.01em}',
    '.c-res span{display:block;font-size:12px;opacity:.85}',
    '.c-note{margin-top:10px;padding:10px 12px;border-radius:12px;background:#fff4e6;color:#8a3a0a;font-size:13px}',
    '.c-note a{font-weight:700;text-decoration:underline}',
    '.calc .h{padding:18px 0 8px}',
    '.pk{display:flex;align-items:center;gap:12px;padding:10px;border:1px solid var(--ln);border-radius:14px;margin-bottom:8px}',
    '.pk:hover{border-color:var(--pr)}',
    '.pk .im{width:52px;height:52px}',
    '.pk .meta b{color:var(--ink);font-weight:600}',
    '.best{background:var(--pr);color:#fff;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:6px;margin-left:6px;vertical-align:1px}',
    '.c-sr{margin-top:6px}',
    '.c-sr .field{height:44px;background:var(--bg)}',
    '.c-sr .field input{font-size:15px}',
    '.c-more{margin-top:10px}',
    '.c-sr.hide,.c-more.hide{display:none}'
  ].join('\n');

  var host, root, $wrap, $ov, $panel, $q, $clr, $tabs, $tools, $res, $idle, $home, $calc, $pages, $body, $cta, $foot, $fab;
  var isOpen = false, sel = -1, pushed = false;
  var onlyStock = false, sortMode = 'rel', shown = PAGE, view = null, tab = 'home';

  function build() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'urun-arama-root';
    root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    root.innerHTML =
      '<style>' + CSS + '</style><div class="root">' +
      '<button class="fab hide" type="button" aria-label="Ürün bul">' + I.search + '<span>Ürün Bul</span></button>' +
      '<div class="ov"><div class="panel" role="dialog" aria-modal="true" aria-label="Ürün arama">' +
      '<div class="top"><button class="back" type="button" data-act="close" aria-label="Kapat">' + I.back + '</button>' +
      '<label class="field">' + I.search +
      '<input type="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Ara">' +
      '<button class="clr" type="button" data-act="clear" aria-label="Temizle">' + I.x + '</button></label>' +
      '<button class="esc" type="button" data-act="close" aria-label="Kapat">Esc</button></div>' +
      '<div class="tabs" role="tablist">' +
      '<button class="tab on" type="button" role="tab" data-act="tab" data-v="home">' + I.grid + 'Keşfet</button>' +
      '<button class="tab" type="button" role="tab" data-act="tab" data-v="calc">' + I.ruler + 'Hacim Hesapla</button>' +
      '<button class="tab" type="button" role="tab" data-act="tab" data-v="pages">' + I.doc + 'Sayfalar</button></div>' +
      '<div class="tools"></div>' +
      '<div class="body"><div class="idle"><div class="pane home on"></div><div class="pane calc-p"></div><div class="pane pages"></div></div>' +
      '<div class="results" aria-live="polite"></div></div>' +
      '<div class="cta"></div><div class="foot"></div>' +
      '</div></div></div>';
    document.body.appendChild(host);
    host.style.fontFamily = getComputedStyle(document.body).fontFamily;
    $wrap = root.querySelector('.root');
    $fab = root.querySelector('.fab');
    $ov = root.querySelector('.ov');
    $panel = root.querySelector('.panel');
    $q = root.querySelector('.top input');
    $clr = root.querySelector('.clr');
    $tools = root.querySelector('.tools');
    $res = root.querySelector('.results');
    $idle = root.querySelector('.idle');
    $home = root.querySelector('.pane.home');
    $calc = root.querySelector('.pane.calc-p');
    $pages = root.querySelector('.pane.pages');
    $tabs = root.querySelector('.tabs');
    $body = root.querySelector('.body');
    $cta = root.querySelector('.cta');
    $foot = root.querySelector('.foot');
    $q.placeholder = 'Ürün, marka veya kategori ara';

    $q.addEventListener('input', function () { shown = PAGE; render(); });
    $q.addEventListener('keydown', onKey);
    $fab.addEventListener('click', function () { open(); });
    $ov.addEventListener('click', function (e) { if (e.target === $ov) close(); });
    root.addEventListener('error', function (e) {
      var t = e.target;
      if (t && t.tagName === 'IMG' && t.parentNode) t.parentNode.innerHTML = I.leaf;
    }, true);
    root.addEventListener('click', onClick);
    root.addEventListener('input', function (e) { if (e.target !== $q) calcInput(e.target); });
    root.addEventListener('focusin', function (e) { calcFocus(e.target, true); });
    root.addEventListener('focusout', function (e) { calcFocus(e.target, false); });
    $panel.addEventListener('keydown', function (e) { if (e.key === 'Escape' && e.target !== $q) close(); });
    setupFab();
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
    else if (act === 'tab') setTab(v);
    else if (act === 'gocalc') { $q.value = ''; render(); setTab('calc'); }
    else if (act === 'shape' || act === 'unit' || act === 'qty') calcAction(act, v, b);
  }

  function setTab(t) {
    if (t === 'calc' && !calcEnabled()) t = 'home';
    if (t === 'pages' && !(CFG.pages || []).length) t = 'home';
    tab = t;
    [].forEach.call($tabs.querySelectorAll('.tab'), function (b) {
      var on = b.getAttribute('data-v') === t;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
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
    if (c.accent) $wrap.style.setProperty('--ac', c.accent);
    if (c.soft) $wrap.style.setProperty('--soft', c.soft);
    if (CFG.placeholder) $q.placeholder = CFG.placeholder;
    var fab = CFG.fab || {};
    $fab.querySelector('span').textContent = fab.text || 'Ürün Bul';
    $fab.classList.toggle('left', fab.side === 'left');
    if (fab.bottom != null) $wrap.style.setProperty('--fb', (+fab.bottom || 0) + 'px');
    updateFab();

    var contact = '';
    if (CFG.whatsapp) contact += '<a class="wa" data-kind="whatsapp" data-name="whatsapp" target="_blank" rel="noopener" href="' + esc(waHref()) + '">' + I.chat + 'WhatsApp ile yaz</a>';
    if (CFG.phone) contact += '<a class="tel" data-kind="phone" data-name="phone" href="tel:' + esc(CFG.phone.replace(/[^\d+]/g, '')) + '">' + I.phone + esc(CFG.phone) + '</a>';
    $foot.innerHTML = (contact ? '<div class="contact">' + contact + '</div>' : '') +
      '<div class="keys"><span><kbd>↑</kbd><kbd>↓</kbd>gezin</span><span><kbd>Enter</kbd>aç</span><span><kbd>Esc</kbd>kapat</span></div>';
    $foot.classList.toggle('on', !!contact);
    $tabs.querySelector('[data-v="calc"]').style.display = calcEnabled() ? '' : 'none';
    $tabs.querySelector('[data-v="pages"]').style.display = (CFG.pages || []).length ? '' : 'none';
    $tabs.style.display = calcEnabled() || (CFG.pages || []).length ? '' : 'none';
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
    return '<div class="im">' + (src ? '<img loading="lazy" alt="" src="' + esc(src) + '">' : I.leaf) + (extra || '') + '</div>';
  }

  function searchHref(q) {
    return STORE + (CFG.searchUrl || '/search?s={q}').replace('{q}', encodeURIComponent(q));
  }

  // ---- Boş kutu: son aramalar, popüler, kategoriler ----
  function renderIdle() {
    if (!$home) return;
    renderPages();
    if (!DATA) { $home.innerHTML = '<div class="spin"></div>'; return; }
    if (view && CATS_BY_ID[view]) { $home.innerHTML = renderCat(CATS_BY_ID[view]); return; }
    view = null;
    var html = '';
    var rec = getRecent();
    if (rec.length) {
      html += '<div class="h">Son aramalar<button type="button" data-act="delall">Temizle</button></div><div class="recent">' +
        rec.map(function (t) {
          return '<div class="row"><button class="r" type="button" data-act="q" data-v="' + esc(t) + '">' + I.clock + esc(t) + '</button>' +
            '<button class="del" type="button" data-act="del" data-v="' + esc(t) + '" aria-label="Sil">' + I.x + '</button></div>';
        }).join('') + '</div>';
    }
    var pop = CFG.popular || [];
    if (pop.length) {
      html += '<div class="h">Çok arananlar</div><div class="trend">' +
        pop.map(function (t) { return '<button class="tq" type="button" data-act="q" data-v="' + esc(t) + '">' + I.trend + esc(t) + '</button>'; }).join('') +
        '</div>';
    }
    var last = (CFG.categoryLast || []).map(fold);
    var rank = function (c) { var i = last.indexOf(c.f); return i < 0 ? -1 : i; };
    var tops = DATA.cats.filter(function (c) { return !c.p || !CATS_BY_ID[c.p]; })
      .sort(function (a, b) { return rank(a) - rank(b) || b.k - a.k; });
    if (tops.length) {
      html += '<div class="h">Kategoriler<small>' + DATA.items.length + ' ürün</small></div><div class="tiles">' +
        tops.map(function (c) {
          var inner = thumb(c.img, 180) + '<div><b>' + esc(c.n) + '</b><small>' + c.k + ' ürün</small></div>';
          return KIDS[c.id]
            ? '<button class="tile" type="button" data-act="cat" data-v="' + esc(c.id) + '">' + inner + '</button>'
            : '<a class="tile" data-kind="category" data-name="' + esc(c.n) + '" href="' + esc(url(c.s)) + '">' + inner + '</a>';
        }).join('') + '</div>';
    }
    $home.innerHTML = html;
  }

  function renderPages() {
    var pages = CFG.pages || [];
    $pages.innerHTML = '<div class="pg list">' + pages.map(function (pg) {
      return '<a class="li" data-kind="page" data-name="' + esc(pg.title) + '" href="' + esc(pageHref(pg.url)) + '">' +
        '<span class="ico">' + I.doc + '</span><span>' + esc(pg.title) + '</span>' + I.right + '</a>';
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
      var inner = thumb(s.img, 180) + '<span>' + esc(s.n) + '<br><small>' + s.k + ' ürün</small></span>' + I.right;
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
      $cta.innerHTML = '<a data-kind="all" data-name="' + esc(q) + '" href="' + esc(searchHref(q.trim())) + '">“' + esc(q.trim()) +
        '” için tüm sonuçlar (' + r.items.length + ')' + I.arrow + '</a>';
      $cta.classList.add('on');
    } else $cta.classList.remove('on');

    if (calcEnabled() && r.tokens.some(function (t) { return /^(hacim|litre|kac|hesap|olcu|metrekup)/.test(t); })) {
      html += '<button class="calc-card" type="button" data-act="gocalc">' + I.ruler +
        '<div><b>Kaç litre toprak gerekir?</b><span>Ölçüleri girin, gereken toprağı ve paketleri hesaplayalım</span></div>' + I.arrow + '</button>';
    }
    var pages = (CFG.pages || []).filter(function (pg) {
      var f = fold(pg.title);
      return r.tokens.every(function (t) { return words(f).some(function (w) { return w.indexOf(t) === 0; }); });
    });
    if (pages.length) {
      html += '<div class="list" style="padding-top:8px">' + pages.slice(0, 3).map(function (pg) {
        return '<a class="li" data-kind="page" data-name="' + esc(pg.title) + '" href="' + esc(pageHref(pg.url)) + '">' +
          '<span class="ico">' + I.doc + '</span><span>' + esc(pg.title) + '</span>' + I.right + '</a>';
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
        (filtered ? 'Stokta eşleşen ürün yok' : '“' + esc(q.trim()) + '” bulunamadı') + '</b><p>' +
        (filtered ? 'Filtreyi kaldırıp tükenen ürünleri de görebilirsiniz.' :
          'Yazımı kontrol edin ya da daha genel bir kelime deneyin.' + (CFG.whatsapp ? ' Aradığınızı bulamazsanız WhatsApp\'tan yazın.' : '')) +
        '</p></div>' +
        (filtered ? '<div class="trend center"><button class="tq" type="button" data-act="stock">Tüm ürünleri göster</button></div>'
          : '<div class="trend center">' + sugg.map(function (t) { return '<button class="tq" type="button" data-act="q" data-v="' + esc(t) + '">' + I.trend + esc(t) + '</button>'; }).join('') + '</div>');
      if (!filtered) track('no_results', q);
      return;
    }

    if (r.cats.length) {
      html += '<div class="cats">' + r.cats.slice(0, 6).map(function (c) {
        return '<a class="cc" data-kind="category" data-name="' + esc(c.n) + '" href="' + esc(url(c.s)) + '">' + I.grid + esc(c.n) + ' <small>' + c.k + '</small></a>';
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
          (p.d != null ? '<s>' + tl(p.p) + '</s><b>' + tl(p.d) + '</b>' : '<b>' + tl(p.p) + '</b>') +
          (p.multi ? '<small>başlayan fiyatlarla</small>' : '');
        return '<a class="item" data-kind="product" data-name="' + esc(p.n) + '" href="' + esc(url(p.s)) + '">' +
          thumb(p.img, 180, off >= 1 ? '<span class="off">%' + off + '</span>' : '') +
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

  // ---------------- Hacim hesaplayıcı ----------------
  var SHAPES = {
    cyl: { n: 'Yuvarlak saksı', f: [['d', 'Çap', 'cm'], ['h', 'Yükseklik', 'cm']],
      v: function (x) { return Math.PI * Math.pow(x.d / 2, 2) * x.h; } },
    cone: { n: 'Konik saksı', f: [['d1', 'Üst çap', 'cm'], ['d2', 'Alt çap', 'cm'], ['h', 'Yükseklik', 'cm']],
      v: function (x) { return Math.PI * x.h / 12 * (x.d1 * x.d1 + x.d1 * x.d2 + x.d2 * x.d2); } },
    box: { n: 'Dikdörtgen saksı', f: [['w', 'En', 'cm'], ['l', 'Boy', 'cm'], ['h', 'Yükseklik', 'cm']],
      v: function (x) { return x.w * x.l * x.h; } },
    bed: { n: 'Bahçe / sebze yatağı', f: [['bw', 'En', 'm'], ['bl', 'Boy', 'm'], ['bd', 'Toprak derinliği', 'cm']],
      v: function (x) { return x.bw * x.bl * x.bd; } }
  };
  var SHAPE_ICON = {
    cyl: svg('<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/>'),
    cone: svg('<ellipse cx="12" cy="5.5" rx="8.5" ry="2.5"/><path d="M3.5 5.5 6.3 18.3c.3 1.3 2.8 2.2 5.7 2.2s5.4-.9 5.7-2.2l2.8-12.8"/>'),
    box: svg('<path d="M4 8.5 8 5h12v10.5L16 19H4z"/><path d="M4 8.5h12V19M16 8.5 20 5"/>'),
    bed: svg('<path d="M2 12.5 6 9.5h16v4l-4 3.5H2z"/><path d="M2 12.5h16V17M18 12.5l4-3M6 12.5v4.5M10 12.5v4.5M14 12.5v4.5"/>')
  };
  var LETTERS = ['A', 'B', 'C'];
  var C = { shape: 'cyl', val: {}, unit: {}, qty: 1, built: false, soil: null };

  function calcEnabled() { return (CFG.calc || {}).enabled !== false; }

  // Ölçü çizgisi: k alan anahtarı, (x1,y1)-(x2,y2) çizgi, (bx,by) harf rozeti, (tx,ty,anchor) değer yazısı
  function dim(k, i, x1, y1, x2, y2, bx, by, tx, ty, anchor) {
    return '<g class="dm" data-k="' + k + '"><line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>' +
      '<circle class="cap" cx="' + x1 + '" cy="' + y1 + '" r="3"/><circle class="cap" cx="' + x2 + '" cy="' + y2 + '" r="3"/>' +
      '<circle class="bd" cx="' + bx + '" cy="' + by + '" r="11"/><text class="lt" x="' + bx + '" y="' + (by + 4) + '">' + LETTERS[i] + '</text>' +
      '<text class="dv" x="' + tx + '" y="' + ty + '" text-anchor="' + (anchor || 'start') + '"></text></g>';
  }
  function figure(shape) {
    var o = '<svg viewBox="0 0 320 220" role="img" aria-label="' + esc(SHAPES[shape].n) + ' ölçüleri">';
    if (shape === 'cyl') {
      o += '<path class="ln" d="M70 60V170A75 18 0 0 0 220 170V60"/>' +
        '<path class="soil" opacity=".22" d="M70 76V170A75 18 0 0 0 220 170V76A75 18 0 0 1 70 76Z"/>' +
        '<ellipse class="soil" opacity=".55" cx="145" cy="76" rx="75" ry="18"/>' +
        '<ellipse class="ln2" cx="145" cy="60" rx="75" ry="18"/>' +
        dim('d', 0, 70, 24, 220, 24, 145, 24, 162, 14) + dim('h', 1, 246, 60, 246, 170, 246, 115, 262, 119);
    } else if (shape === 'cone') {
      o += '<path class="ln" d="M62 58 94 170A51 13 0 0 0 196 170L228 58"/>' +
        '<path class="soil" opacity=".22" d="M66 74 94 170A51 13 0 0 0 196 170L224 74A79 18 0 0 1 66 74Z"/>' +
        '<ellipse class="soil" opacity=".55" cx="145" cy="74" rx="79" ry="18"/>' +
        '<ellipse class="ln2" cx="145" cy="58" rx="83" ry="19"/>' +
        dim('d1', 0, 62, 22, 228, 22, 145, 22, 162, 12) + dim('d2', 1, 94, 204, 196, 204, 145, 204, 162, 218) +
        dim('h', 2, 252, 58, 252, 170, 252, 114, 268, 118);
    } else if (shape === 'box') {
      o += '<path class="ln" d="M60 80 104 48H234V148L190 180H60Z"/>' +
        '<path class="ln2" d="M60 80H190V180M190 80 234 48"/>' +
        '<path class="soil" opacity=".5" d="M60 94 104 62H234L190 94Z"/>' +
        '<path class="soil" opacity=".18" d="M60 94H190V180H60Z"/>' +
        dim('w', 0, 60, 202, 190, 202, 125, 202, 142, 216) + dim('l', 1, 202, 190, 246, 158, 224, 174, 240, 196) +
        dim('h', 2, 36, 80, 36, 180, 36, 130, 36, 68, 'middle');
    } else {
      o += '<path class="ln" d="M24 112 74 78H290V124L240 158H24Z"/>' +
        '<path class="ln2" d="M24 112H240V158M240 112 290 78M78 112V158M132 112V158M186 112V158"/>' +
        '<path class="soil" opacity=".55" d="M24 120 74 86H290L240 120Z"/>' +
        '<path class="soil" opacity=".18" d="M24 120H240V158H24Z"/>' +
        dim('bw', 0, 252, 168, 302, 134, 277, 151, 277, 180, 'middle') + dim('bl', 1, 24, 182, 240, 182, 132, 182, 149, 204) +
        dim('bd', 2, 12, 112, 12, 158, 12, 135, 4, 100, 'start');
    }
    return o + '</svg>';
  }

  function calcBuild() {
    if (!C.built) {
      C.built = true;
      $calc.innerHTML = '<div class="calc">' +
        '<div class="c-in"><div class="ic">' + I.ruler + '</div><div><b>Toprak hesaplayıcı</b>' +
        '<p>Saksınızın ya da yatağınızın iç ölçülerini girin; kaç litre toprak gerektiğini ve hangi paketlerle en uygun şekilde alabileceğinizi gösterelim.</p></div></div>' +
        '<div class="shp">' + Object.keys(SHAPES).map(function (k) {
          return '<button class="sh" type="button" data-act="shape" data-v="' + k + '">' + SHAPE_ICON[k] + esc(SHAPES[k].n) + '</button>';
        }).join('') + '</div>' +
        '<div class="c-main"><div class="c-fig"></div><div class="c-form"></div></div>' +
        '<div class="c-out"></div>' +
        '<div class="c-sr hide"><div class="h">Başka bir toprak mı istiyorsunuz?</div><label class="field">' + I.search +
        '<input type="search" data-k="soilq" autocomplete="off" placeholder="Toprak ara (ör. torf, perlit, orkide)"></label></div>' +
        '<div class="c-more hide"></div></div>';
    }
    calcShape(C.shape);
  }

  function calcShape(k) {
    C.shape = k;
    var s = SHAPES[k];
    [].forEach.call($calc.querySelectorAll('.sh'), function (b) { b.classList.toggle('on', b.getAttribute('data-v') === k); });
    $calc.querySelector('.c-fig').innerHTML = figure(k);
    $calc.querySelector('.c-form').innerHTML = s.f.map(function (f, i) {
      var u = C.unit[f[0]] || f[2];
      return '<div class="cf"><label for="ua-' + f[0] + '"><i>' + LETTERS[i] + '</i>' + esc(f[1]) + '</label>' +
        '<div class="ci"><input id="ua-' + f[0] + '" data-k="' + f[0] + '" inputmode="decimal" autocomplete="off" placeholder="Değer girin" value="' + esc(C.val[f[0]] || '') + '">' +
        '<div class="un">' + ['cm', 'm'].map(function (x) {
          return '<button type="button" data-act="unit" data-k="' + f[0] + '" data-v="' + x + '" class="' + (u === x ? 'on' : '') + '">' + x + '</button>';
        }).join('') + '</div></div></div>';
    }).join('') +
      '<div class="cq"><span>' + (k === 'bed' ? 'Yatak sayısı' : 'Saksı sayısı') + '</span><div class="stp">' +
      '<button type="button" data-act="qty" data-v="-1" aria-label="Azalt">' + I.minus + '</button>' +
      '<input data-k="qty" inputmode="numeric" value="' + C.qty + '" aria-label="Adet">' +
      '<button type="button" data-act="qty" data-v="1" aria-label="Artır">' + I.plus + '</button></div></div>' +
      '<p class="c-tip">' + (k === 'bed' ? 'Derinlik: toprağın dolacağı yükseklik. Sebze için en az 25–30 cm önerilir.' : 'Kenar kalınlığı hariç, iç ölçüleri girin.') + '</p>';
    s.f.forEach(function (f) { figValue(f[0]); });
    calcUpdate();
  }

  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return n > 0 ? n : 0; }
  function figValue(k) {
    var t = $calc.querySelector('.c-fig .dm[data-k="' + k + '"] .dv');
    if (!t) return;
    var n = num(C.val[k]), f = SHAPES[C.shape].f.filter(function (x) { return x[0] === k; })[0];
    t.textContent = n ? n.toLocaleString('tr-TR') + ' ' + (C.unit[k] || f[2]) : '';
  }

  function calcInput(el) {
    var k = el.getAttribute && el.getAttribute('data-k');
    if (!k || !$calc || !$calc.contains(el)) return;
    if (k === 'soilq') { soilSearch(); return; }
    if (k === 'qty') { C.qty = Math.max(1, Math.min(999, parseInt(el.value, 10) || 1)); calcUpdate(); return; }
    C.val[k] = el.value;
    figValue(k);
    calcUpdate();
  }
  function calcFocus(el, on) {
    var k = el.getAttribute && el.getAttribute('data-k');
    if (!k || !$calc || !$calc.contains(el)) return;
    var g = $calc.querySelector('.c-fig .dm[data-k="' + k + '"]');
    if (g) g.classList.toggle('on', on);
  }
  function calcAction(act, v, b) {
    if (act === 'shape') calcShape(v);
    else if (act === 'unit') {
      var k = b.getAttribute('data-k');
      C.unit[k] = v;
      [].forEach.call(b.parentNode.children, function (x) { x.classList.toggle('on', x === b); });
      figValue(k);
      calcUpdate();
    } else if (act === 'qty') {
      C.qty = Math.max(1, Math.min(999, C.qty + (+v)));
      $calc.querySelector('.stp input').value = C.qty;
      calcUpdate();
    }
  }

  function need() {
    var s = SHAPES[C.shape], x = {}, ok = true;
    s.f.forEach(function (f) {
      var n = num(C.val[f[0]]);
      if (!n) ok = false;
      x[f[0]] = n * ((C.unit[f[0]] || f[2]) === 'm' ? 100 : 1);
    });
    if (!ok) return null;
    var one = s.v(x) / 1000;
    return { one: one, total: one * C.qty };
  }
  function fmtL(n) {
    return n.toLocaleString('tr-TR', { maximumFractionDigits: n < 10 ? 1 : 0 }) + ' L';
  }

  // Toprak ürünleri ve paket boyları (ürün/varyant adındaki "40 Lt", "65 L" vb.)
  var SIZE_RE = /(\d+(?:[.,]\d+)?)\s*(?:lt|litre|litrelik|l)(?![a-zçğıöşü])/i;
  function litres(s) { var m = String(s || '').match(SIZE_RE); return m ? parseFloat(m[1].replace(',', '.')) : 0; }
  function soilList() {
    if (C.soil) return C.soil;
    var names = ((CFG.calc || {}).categories || ['Topraklar']).map(fold), set = {};
    DATA.cats.forEach(function (c) {
      if (names.indexOf(c.f) === -1) return;
      (function add(id) { set[id] = 1; (KIDS[id] || []).forEach(function (k) { add(k.id); }); })(c.id);
    });
    C.soil = [];
    DATA.items.forEach(function (p) {
      if (!p.c.some(function (x) { return set[x]; })) return;
      var sizes = p.v
        ? p.v.map(function (v) { return { L: litres(v.name), pr: v.d != null ? v.d : v.p, ok: v.st > 0 || !!v.oos, n: v.name }; })
        : [{ L: litres(p.n), pr: price(p), ok: !!p.st, n: '' }];
      sizes = sizes.filter(function (z) { return z.L > 0 && z.pr != null && z.ok; });
      sizes.forEach(function (z) { z.n = z.n || fmtL(z.L); });
      if (sizes.length) C.soil.push({ p: p, sizes: sizes });
    });
    return C.soil;
  }

  // En az maliyetle en az N litreyi karşılayan paket kombinasyonu (yarım litre hassasiyet)
  function bestCombo(sizes, N) {
    var u = sizes.map(function (z) { return Math.max(1, Math.round(z.L * 2)); });
    var target = Math.ceil(N * 2), max = Math.max.apply(null, u), lim = target + max;
    if (lim > 60000) {
      var big = sizes[u.indexOf(max)], cnt = Math.ceil(N / big.L);
      return { cost: cnt * big.pr, L: cnt * big.L, parts: [{ z: big, c: cnt }] };
    }
    var dp = new Float64Array(lim + 1).fill(Infinity), ch = new Int16Array(lim + 1).fill(-1);
    dp[0] = 0;
    for (var x = 1; x <= lim; x++) {
      for (var i = 0; i < u.length; i++) {
        if (x >= u[i] && dp[x - u[i]] !== Infinity) {
          var c = dp[x - u[i]] + sizes[i].pr + 0.001; // eşitlikte daha az paket
          if (c < dp[x]) { dp[x] = c; ch[x] = i; }
        }
      }
    }
    var bx = -1;
    for (var y = target; y <= lim; y++) if (dp[y] !== Infinity && (bx < 0 || dp[y] < dp[bx])) bx = y;
    if (bx < 0) return null;
    var cnt2 = {}, cost = 0, tot = 0;
    for (var z = bx; z > 0; z -= u[ch[z]]) { cnt2[ch[z]] = (cnt2[ch[z]] || 0) + 1; cost += sizes[ch[z]].pr; tot += sizes[ch[z]].L; }
    var parts = Object.keys(cnt2).map(function (i) { return { z: sizes[i], c: cnt2[i] }; })
      .sort(function (a, b) { return b.z.L - a.z.L; });
    return { cost: cost, L: tot, parts: parts };
  }

  function packRow(e, N, best) {
    var cb = bestCombo(e.sizes, N);
    if (!cb) return '';
    return '<a class="pk" data-kind="calc_product" data-name="' + esc(e.p.n) + '" href="' + esc(url(e.p.s)) + '">' + thumb(e.p.img, 180) +
      '<div class="info"><div class="pname">' + esc(e.p.n) + (best ? '<span class="best">En uygun</span>' : '') + '</div>' +
      '<div class="meta"><b>' + cb.parts.map(function (x) { return x.c + ' × ' + esc(x.z.n); }).join(' + ') + '</b><span>= ' + fmtL(cb.L) + '</span></div></div>' +
      '<div class="price"><b>' + tl(cb.cost) + '</b></div></a>';
  }
  function combos(list, N) {
    return list.map(function (e) { return { e: e, cb: bestCombo(e.sizes, N) }; })
      .filter(function (x) { return x.cb; })
      .sort(function (a, b) { return a.cb.cost - b.cb.cost; });
  }

  function calcUpdate() {
    var out = $calc.querySelector('.c-out'), sr = $calc.querySelector('.c-sr'), more = $calc.querySelector('.c-more');
    var r = need();
    if (!r) {
      out.innerHTML = '<div class="c-hint">Ölçüleri girdiğinizde gereken toprak miktarı burada görünecek.</div>';
      sr.classList.add('hide'); more.classList.add('hide');
      return;
    }
    var extra = (CFG.calc || {}).extra != null ? +CFG.calc.extra : 10;
    var rec = Math.max(1, Math.ceil(r.total * (1 + extra / 100)));
    var html = '<div class="c-res"><div class="c-big"><small>Gereken toprak</small><b>' + fmtL(r.total) + '</b>' +
      '<span>' + (C.qty > 1 ? C.qty + ' × ' + fmtL(r.one) : SHAPES[C.shape].n) + '</span></div>' +
      '<div class="c-rec"><small>Önerilen alım</small><b>' + fmtL(rec) + '</b><span>Sulayınca toprak ~%' + extra + ' çöker</span></div></div>';
    if (r.total >= 1000) {
      html += '<div class="c-note">Yaklaşık ' + (r.total / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' m³ toprak gerekiyor. ' +
        (CFG.whatsapp ? '<a target="_blank" rel="noopener" href="' + esc(waHref('Merhaba, yaklaşık ' + Math.round(rec) + ' litre toprak için fiyat almak istiyorum.')) + '">Toplu alım fiyatı için WhatsApp\'tan yazın</a>'
          : CFG.phone ? 'Toplu alım fiyatı için bizi arayın: <a href="tel:' + esc(CFG.phone.replace(/[^\d+]/g, '')) + '">' + esc(CFG.phone) + '</a>' : 'Toplu alımlarda bizimle iletişime geçin.') + '</div>';
    }
    if (DATA) {
      var sug = ((CFG.calc || {}).suggest || {})[C.shape === 'bed' ? 'bed' : 'pot'] || [];
      var list = soilList(), pick = sug.map(function (sl) { return list.filter(function (e) { return e.p.s === sl; })[0]; }).filter(Boolean);
      if (!pick.length) pick = list;
      var rows = combos(pick, rec).slice(0, 4);
      if (rows.length) {
        html += '<div class="h">' + fmtL(rec) + ' için paket önerileri<small>stoktaki boylarla</small></div>' +
          rows.map(function (x, i) { return packRow(x.e, rec, i === 0 && rows.length > 1); }).join('');
      }
      sr.classList.toggle('hide', !list.length);
    }
    out.innerHTML = html;
    C.rec = rec;
    soilSearch();
  }

  function soilSearch() {
    var more = $calc.querySelector('.c-more'), q = $calc.querySelector('[data-k="soilq"]').value.trim();
    if (!q || !C.rec || !DATA) { more.classList.add('hide'); more.innerHTML = ''; return; }
    var list = soilList(), byId = {};
    list.forEach(function (e) { byId[e.p.id] = e; });
    var hits = search(q).items.map(function (x) { return byId[x.p.id]; }).filter(Boolean).slice(0, 5);
    more.innerHTML = hits.length ? hits.map(function (e) { return packRow(e, C.rec, false); }).join('')
      : '<div class="c-hint" style="margin-top:0">“' + esc(q) + '” için litre bilgisi olan toprak bulunamadı.</div>';
    more.classList.remove('hide');
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
