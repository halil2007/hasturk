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
    chat: svg('<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/>')
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

    '.foot{display:none;align-items:center;gap:16px;padding:10px 16px;border-top:1px solid var(--ln);font-size:12.5px;color:var(--mu)}',
    '.foot.on{display:flex}',
    '.typing .foot{display:none}',
    '.keys{display:none;gap:14px;margin-left:auto}',
    '@media(min-width:760px){.foot{display:flex}.keys{display:flex}}',
    '.keys kbd{font:inherit;font-size:11px;font-weight:600;border:1px solid var(--ln);border-bottom-width:2px;border-radius:5px;padding:0 5px;margin-right:4px;color:var(--ink)}',
    '.contact{display:flex;gap:8px}',
    '.contact a{display:flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:10px;background:var(--bg);color:var(--ink);font-weight:600;font-size:13px}',
    '.contact svg{width:16px;height:16px;color:var(--pr)}'
  ].join('\n');

  var host, root, $wrap, $ov, $panel, $q, $clr, $tools, $res, $idle, $body, $cta, $foot, $fab;
  var isOpen = false, sel = -1, pushed = false;
  var onlyStock = false, sortMode = 'rel', shown = PAGE, view = null;

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
      '<div class="tools"></div>' +
      '<div class="body"><div class="idle"></div><div class="results" aria-live="polite"></div></div>' +
      '<div class="cta"></div><div class="foot"></div>' +
      '</div></div></div>';
    document.body.appendChild(host);
    host.style.fontFamily = getComputedStyle(document.body).fontFamily;
    $wrap = root.querySelector('.root');
    $fab = root.querySelector('.fab');
    $ov = root.querySelector('.ov');
    $panel = root.querySelector('.panel');
    $q = root.querySelector('input');
    $clr = root.querySelector('.clr');
    $tools = root.querySelector('.tools');
    $res = root.querySelector('.results');
    $idle = root.querySelector('.idle');
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
    if (CFG.phone) contact += '<a href="tel:' + esc(CFG.phone.replace(/\s/g, '')) + '">' + I.phone + esc(CFG.phone) + '</a>';
    if (CFG.whatsapp) contact += '<a target="_blank" rel="noopener" href="https://wa.me/' + esc(CFG.whatsapp.replace(/\D/g, '')) + '">' + I.chat + 'WhatsApp</a>';
    $foot.innerHTML = (contact ? '<div class="contact">' + contact + '</div>' : '') +
      '<div class="keys"><span><kbd>↑</kbd><kbd>↓</kbd>gezin</span><span><kbd>Enter</kbd>aç</span><span><kbd>Esc</kbd>kapat</span></div>';
    $foot.classList.toggle('on', !!contact);
    renderIdle();
  }

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
    if (!$idle) return;
    if (!DATA) { $idle.innerHTML = '<div class="spin"></div>'; return; }
    if (view && CATS_BY_ID[view]) { $idle.innerHTML = renderCat(CATS_BY_ID[view]); return; }
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
    var tops = DATA.cats.filter(function (c) { return !c.p || !CATS_BY_ID[c.p]; }).sort(function (a, b) { return b.k - a.k; });
    if (tops.length) {
      html += '<div class="h">Kategoriler<small>' + DATA.items.length + ' ürün</small></div><div class="tiles">' +
        tops.map(function (c) {
          var inner = thumb(c.img, 180) + '<div><b>' + esc(c.n) + '</b><small>' + c.k + ' ürün</small></div>';
          return KIDS[c.id]
            ? '<button class="tile" type="button" data-act="cat" data-v="' + esc(c.id) + '">' + inner + '</button>'
            : '<a class="tile" data-kind="category" data-name="' + esc(c.n) + '" href="' + esc(url(c.s)) + '">' + inner + '</a>';
        }).join('') + '</div>';
    }
    $idle.innerHTML = html;
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

    if (!items.length && !r.cats.length) {
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
  function open(initial) {
    build();
    if (!isOpen) {
      isOpen = true;
      view = null;
      $ov.classList.add('on');
      updateFab();
      prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      try { history.pushState({ urunArama: 1 }, ''); pushed = true; } catch (e) {}
    }
    if (typeof initial === 'string' && initial) $q.value = initial;
    $q.focus();
    shown = PAGE;
    render();
    renderIdle();
    load().then(function () { renderIdle(); render(); }, function () {
      $idle.innerHTML = '<div class="empty"><b>Arama şu an yüklenemedi</b><p>Lütfen sayfayı yenileyip tekrar deneyin.</p></div>';
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

  window.UrunArama = window.PMSearch = { open: open, close: close, search: function (q) { return load().then(function () { return search(q); }); } };
})();
