/*! Mağaza arama widget'ı — ikas için. Tek satırla eklenir:
 *  <script src="https://SENIN-ADRESIN.pages.dev/pm-search.js" defer></script>
 *  İsteğe bağlı data-* ayarları:
 *   data-selector  hangi arama kutuları yakalansın (CSS seçici)
 *   data-trigger   tıklanınca aramayı açacak ek öğeler (örn. büyüteç ikonu)
 *   data-json      products.json adresi (varsayılan: script ile aynı klasör)
 *   data-store     mağaza adresi (varsayılan: bulunulan site)
 */
(function () {
  'use strict';
  if (window.PMSearch) return;

  var script = document.currentScript || document.querySelector('script[src*="pm-search"]');
  var ds = (script && script.dataset) || {};
  var BASE = script ? new URL('.', script.src).href : '/';
  var JSON_URL = ds.json || BASE + 'products.json';
  var STORE = (ds.store || location.origin).replace(/\/$/, '');
  var SELECTOR = ds.selector ||
    'input[type="search"], input[name="q"], input[name="s"], input[placeholder*="ara" i], input[placeholder*="Ara"], input[placeholder*="ARA"]';
  var TRIGGER = ds.trigger || '';
  var CACHE_KEY = 'pms-data-v1';
  var CACHE_MS = 20 * 60 * 1000;

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

  // ---------------- Veri ----------------
  var DATA = null, CATS_BY_ID = {}, SYN = {}, CFG = {}, loading = null;

  function prepare(d) {
    DATA = d;
    CFG = d.config || {};
    SYN = {};
    Object.keys(CFG.synonyms || {}).forEach(function (k) {
      SYN[fold(k)] = (CFG.synonyms[k] || []).map(fold);
    });
    CATS_BY_ID = {};
    d.cats.forEach(function (c) { CATS_BY_ID[c.id] = c; c.f = fold(c.n); });
    d.items.forEach(function (p) {
      var catNames = p.c.map(function (id) { return CATS_BY_ID[id] ? CATS_BY_ID[id].n : ''; }).join(' ');
      var varNames = (p.v || []).map(function (v) { return v.name || ''; }).join(' ');
      p.nf = fold(p.n);
      p.hay = fold([p.n, p.b || '', catNames, (p.t || []).join(' '), varNames].join(' '));
      p.w = words(p.hay);
      p.nw = words(p.nf);
      var leaf = p.c.map(function (id) { return CATS_BY_ID[id]; }).filter(Boolean)
        .sort(function (a, b) { return (b.p ? 1 : 0) - (a.p ? 1 : 0); })[0];
      p.cn = leaf ? leaf.n : '';
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

  // ---------------- Arayüz ----------------
  var ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  var ICON_CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 6 6 6-6 6"/></svg>';
  var ICON_LEAF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21c-5 0-8-3.5-8-8 6 0 8 3 8 8zm0 0c0-6 3-9 8-9 0 5-3 9-8 9zM12 13V5"/></svg>';
  var ICON_WA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/><path d="M9 10h6M9 14h4"/></svg>';

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}',
    '.ov{position:fixed;inset:0;z-index:2147483000;background:rgba(10,25,15,.45);display:none;font-family:inherit;color:var(--ink);-webkit-font-smoothing:antialiased}',
    '.ov.on{display:block}',
    '.panel{--pr:#1e5c30;--dk:#133a20;--ac:#f5d90a;--cl:#d62b2b;--ink:#15231a;--mu:#6b7a70;--ln:#e7ece8;--pill:#eef2ef;',
    ' position:absolute;inset:0;background:#fff;display:flex;flex-direction:column;overflow:hidden;animation:in .18s ease-out}',
    '@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
    '@media(min-width:760px){.panel{inset:6vh auto auto 50%;transform:translateX(-50%);width:680px;max-height:86vh;border-radius:20px;box-shadow:0 24px 60px rgba(0,0,0,.25);animation:none}}',
    '.head{background:var(--pr);padding:12px 16px;display:flex;align-items:center;gap:10px;color:#fff;font-weight:600;font-size:16px}',
    '.head span{flex:1}',
    '.bar{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--ln);background:#fafcfb}',
    '.field{flex:1;display:flex;align-items:center;gap:10px;border:2px solid #7f9184;border-radius:16px;padding:0 14px;height:52px;background:#fff;transition:border-color .15s,box-shadow .15s}',
    '.field:focus-within{border-color:var(--pr);box-shadow:0 0 0 4px rgba(30,92,48,.12)}',
    '.field svg{width:20px;height:20px;flex:none;color:#3b4a40}',
    '.field input{flex:1;border:0;outline:0;font:inherit;font-size:16px;color:var(--ink);background:transparent;min-width:0;-webkit-appearance:none;appearance:none}',
    '.field input::-webkit-search-cancel-button{display:none}',
    '.x{width:52px;height:52px;border-radius:50%;border:0;background:var(--cl);color:#fff;display:grid;place-items:center;box-shadow:0 6px 14px rgba(214,43,43,.35);cursor:pointer;flex:none}',
    '.x svg{width:22px;height:22px}',
    '.body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}',
    '.sec{padding:16px 16px 6px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--mu);display:flex;justify-content:space-between}',
    '.chips{display:flex;flex-wrap:wrap;gap:8px;padding:6px 16px 12px}',
    '.chip{border:1px solid var(--ln);background:var(--pill);border-radius:999px;padding:7px 14px;font:inherit;font-size:13.5px;color:var(--ink);cursor:pointer}',
    '.chip:hover{background:#e1e8e3}',
    '.cat-row{display:flex;align-items:center;gap:14px;padding:16px;width:100%;background:none;border:0;font:inherit;text-align:left;color:inherit;cursor:pointer;text-decoration:none}',
    '.chev{width:18px;height:18px;transition:transform .2s;flex:none}',
    '.cat.open .chev{transform:rotate(90deg)}',
    '.cat-name{flex:1;font-size:17px;font-weight:600}',
    '.count{background:var(--pill);border-radius:999px;padding:3px 12px;font-size:13.5px;color:#3d4b42;min-width:44px;text-align:center}',
    '.subs{display:none;padding:0 16px 8px 48px}',
    '.cat.open .subs{display:block}',
    '.sub{display:flex;justify-content:space-between;padding:11px 0;font-size:15px;color:#2e3c33;border-top:1px solid var(--ln);text-decoration:none}',
    '.sub small{color:var(--mu);font-size:13px}',
    '.results{display:none}.typing .results{display:block}.typing .idle{display:none}',
    '.item{display:flex;gap:12px;align-items:center;padding:10px 16px;text-decoration:none;color:inherit;border-bottom:1px solid var(--ln)}',
    '.item.sel,.item:hover{background:#f1f7f2}',
    '.thumb{width:60px;height:60px;border-radius:12px;flex:none;background:var(--pill);display:grid;place-items:center;color:var(--pr);overflow:hidden}',
    '.thumb img{width:100%;height:100%;object-fit:cover;display:block}',
    '.thumb svg{width:26px;height:26px;opacity:.6}',
    '.info{flex:1;min-width:0}',
    '.pname{font-size:15px;font-weight:500;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    'mark{background:#fff2a8;color:inherit;border-radius:3px;padding:0 1px}',
    '.pmeta{font-size:12.5px;color:var(--mu);margin-top:3px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}',
    '.badge{background:var(--ac);color:#1d2a10;font-weight:600;font-size:11px;padding:2px 8px;border-radius:999px}',
    '.oos{background:#fde3e3;color:#a61d1d;font-weight:600;font-size:11px;padding:2px 8px;border-radius:999px}',
    '.price{text-align:right;flex:none;white-space:nowrap}',
    '.price b{display:block;font-size:15px;color:var(--pr)}',
    '.price s{font-size:12px;color:#9aa59e}',
    '.price small{display:block;font-size:11px;color:var(--mu)}',
    '.catres{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 16px;text-decoration:none;color:inherit;border-bottom:1px solid var(--ln);font-size:15px}',
    '.catres:hover{background:#f1f7f2}',
    '.catres small{color:var(--mu)}',
    '.all{display:block;margin:16px;padding:15px;border-radius:14px;background:var(--pr);color:#fff;text-align:center;font-weight:600;text-decoration:none;font-size:15px}',
    '.msg{padding:36px 24px 16px;text-align:center;color:var(--mu);font-size:14.5px}',
    '.msg b{display:block;color:var(--ink);font-size:17px;margin-bottom:6px}',
    '.center{justify-content:center}',
    '.spin{width:28px;height:28px;border:3px solid var(--ln);border-top-color:var(--pr);border-radius:50%;margin:40px auto;animation:sp 0.8s linear infinite}',
    '@keyframes sp{to{transform:rotate(360deg)}}',
    '.foot{display:none;border-top:1px solid var(--ln);justify-content:space-between;align-items:center;gap:10px;padding:12px 16px;background:#fff}',
    '.foot.on{display:flex}',
    '.call{font-size:14.5px;color:#3d4b42;text-decoration:none}',
    '.call b{color:var(--pr);font-weight:700;margin-left:6px}',
    '.wa{display:flex;align-items:center;gap:8px;background:var(--pr);color:#fff;border-radius:999px;padding:11px 18px;font-weight:600;text-decoration:none;font-size:15px}',
    '.wa svg{width:20px;height:20px}'
  ].join('\n');

  var host, root, $ov, $panel, $q, $res, $idle, $body, $foot, isOpen = false, sel = -1, pushed = false;

  function build() {
    host = document.createElement('div');
    host.id = 'pm-search-root';
    root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    root.innerHTML =
      '<style>' + CSS + '</style>' +
      '<div class="ov" part="overlay"><div class="panel" role="dialog" aria-modal="true" aria-label="Arama">' +
      '<div class="bar"><label class="field">' + ICON_SEARCH +
      '<input type="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search" aria-label="Ara"></label>' +
      '<button class="x" aria-label="Kapat">' + ICON_X + '</button></div>' +
      '<div class="body"><div class="idle"></div><div class="results" aria-live="polite"></div></div>' +
      '<div class="foot"></div>' +
      '</div></div>';
    document.body.appendChild(host);
    host.style.fontFamily = getComputedStyle(document.body).fontFamily;
    $ov = root.querySelector('.ov');
    $panel = root.querySelector('.panel');
    $q = root.querySelector('input');
    $res = root.querySelector('.results');
    $idle = root.querySelector('.idle');
    $body = root.querySelector('.body');
    $foot = root.querySelector('.foot');
    $q.placeholder = 'Ürün, malzeme veya bitki ara';

    $q.addEventListener('input', render);
    $q.addEventListener('keydown', onKey);
    root.querySelector('.x').addEventListener('click', function () {
      if ($q.value) { $q.value = ''; render(); $q.focus(); } else close();
    });
    $ov.addEventListener('click', function (e) { if (e.target === $ov) close(); });
    root.addEventListener('error', function (e) {
      var t = e.target;
      if (t && t.tagName === 'IMG' && t.parentNode) t.parentNode.innerHTML = ICON_LEAF;
    }, true);
    root.addEventListener('click', function (e) {
      var chip = e.target.closest && e.target.closest('.chip');
      if (chip) { $q.value = chip.textContent; render(); $q.focus(); return; }
      var row = e.target.closest && e.target.closest('button.cat-row');
      if (row) { row.parentElement.classList.toggle('open'); return; }
      var a = e.target.closest && e.target.closest('a[data-kind]');
      if (a) track(a.getAttribute('data-kind'), a.getAttribute('data-name'));
    });
  }

  function applyConfig() {
    if (!$panel) return;
    var c = CFG.colors || {};
    if (c.primary) $panel.style.setProperty('--pr', c.primary);
    if (c.dark) $panel.style.setProperty('--dk', c.dark);
    if (c.accent) $panel.style.setProperty('--ac', c.accent);
    if (c.close) $panel.style.setProperty('--cl', c.close);
    if (CFG.placeholder) $q.placeholder = CFG.placeholder;
    var foot = '';
    if (CFG.phone) foot += '<a class="call" href="tel:' + esc(CFG.phone.replace(/\s/g, '')) + '">Arayın:<b>' + esc(CFG.phone) + '</b></a>';
    if (CFG.whatsapp) foot += '<a class="wa" target="_blank" rel="noopener" href="https://wa.me/' + esc(CFG.whatsapp.replace(/\D/g, '')) + '">' + ICON_WA + 'WhatsApp</a>';
    $foot.innerHTML = foot;
    $foot.classList.toggle('on', !!foot);
    renderIdle();
  }

  function url(slug) { return STORE + '/' + String(slug).replace(/^\//, ''); }

  function renderIdle() {
    if (!DATA) { $idle.innerHTML = '<div class="spin"></div>'; return; }
    var html = '';
    var pop = CFG.popular || [];
    if (pop.length) {
      html += '<div class="sec">Popüler aramalar</div><div class="chips">' +
        pop.map(function (t) { return '<button class="chip">' + esc(t) + '</button>'; }).join('') + '</div>';
    }
    var tops = DATA.cats.filter(function (c) { return !c.p || !CATS_BY_ID[c.p]; });
    if (tops.length) {
      html += '<div class="sec">Kategoriler</div>';
      html += tops.map(function (c) {
        var subs = DATA.cats.filter(function (s) { return s.p === c.id; });
        if (!subs.length) {
          return '<div class="cat"><a class="cat-row" data-kind="category" data-name="' + esc(c.n) + '" href="' + esc(url(c.s)) + '">' +
            ICON_CHEV + '<span class="cat-name">' + esc(c.n) + '</span><span class="count">' + c.k + '</span></a></div>';
        }
        return '<div class="cat"><button class="cat-row">' + ICON_CHEV + '<span class="cat-name">' + esc(c.n) +
          '</span><span class="count">' + c.k + '</span></button><div class="subs">' +
          '<a class="sub" data-kind="category" data-name="' + esc(c.n) + '" href="' + esc(url(c.s)) + '"><span>Tümünü gör</span><small>' + c.k + ' ürün</small></a>' +
          subs.map(function (s) {
            return '<a class="sub" data-kind="category" data-name="' + esc(s.n) + '" href="' + esc(url(s.s)) + '"><span>' + esc(s.n) + '</span><small>' + s.k + ' ürün</small></a>';
          }).join('') + '</div></div>';
      }).join('');
    }
    $idle.innerHTML = html;
  }

  function imgUrl(p) {
    if (!p.img || !DATA.merchant) return '';
    var parts = p.img.split('/');
    return 'https://cdn.myikas.com/images/' + DATA.merchant + '/' + parts[0] + '/180/' + encodeURIComponent(parts[1] || 'image') + '.webp';
  }

  function searchHref(q) {
    return STORE + (CFG.searchUrl || '/search?s={q}').replace('{q}', encodeURIComponent(q));
  }

  function render() {
    var q = $q.value;
    $panel.classList.toggle('typing', q.trim().length > 0);
    sel = -1;
    if (!q.trim()) { $res.innerHTML = ''; return; }
    if (!DATA) { $res.innerHTML = '<div class="spin"></div>'; return; }
    var r = search(q), html = '';
    var badges = CFG.badges || {};

    if (!r.items.length && !r.cats.length) {
      var pop = CFG.popular || [];
      var sugg = pop.filter(function (p) {
        return r.tokens.some(function (t) { return lev(fold(p).slice(0, t.length), t) <= 2; });
      }).slice(0, 4);
      if (!sugg.length) sugg = pop.slice(0, 4);
      $res.innerHTML = '<div class="msg"><b>“' + esc(q) + '” için sonuç bulunamadı</b>Farklı bir kelime deneyin' +
        (CFG.whatsapp ? ' veya bize WhatsApp\'tan sorun.' : '.') + '</div>' +
        '<div class="chips center">' + sugg.map(function (t) { return '<button class="chip">' + esc(t) + '</button>'; }).join('') + '</div>';
      track('no_results', q);
      return;
    }
    if (r.cats.length) {
      html += '<div class="sec">Kategoriler</div>' + r.cats.slice(0, 3).map(function (c) {
        var parent = c.p && CATS_BY_ID[c.p] ? ' <small>· ' + esc(CATS_BY_ID[c.p].n) + '</small>' : '';
        return '<a class="catres" data-kind="category" data-name="' + esc(c.n) + '" href="' + esc(url(c.s)) + '"><span>' + esc(c.n) + parent +
          '</span><small>' + c.k + ' ürün</small></a>';
      }).join('');
    }
    if (r.items.length) {
      html += '<div class="sec"><span>Ürünler</span><span>' + r.items.length + ' sonuç</span></div>';
      html += r.items.slice(0, 10).map(function (x) {
        var p = x.p, src = imgUrl(p);
        var tagBadges = (p.t || []).filter(function (t) { return badges[t]; })
          .map(function (t) { return '<span class="badge">' + esc(badges[t]) + '</span>'; }).join('');
        var price = p.p == null ? '' :
          (p.d != null ? '<s>' + tl(p.p) + '</s><b>' + tl(p.d) + '</b>' : '<b>' + tl(p.p) + '</b>') +
          (p.multi ? '<small>başlayan fiyatlarla</small>' : '');
        return '<a class="item" data-kind="product" data-name="' + esc(p.n) + '" href="' + esc(url(p.s)) + '">' +
          '<div class="thumb">' + (src ? '<img loading="lazy" alt="" src="' + esc(src) + '">' : ICON_LEAF) + '</div>' +
          '<div class="info"><div class="pname">' + highlight(p.n, p.nf, x.h) + '</div>' +
          '<div class="pmeta">' + esc(p.cn) + tagBadges + (p.st ? '' : '<span class="oos">Tükendi</span>') + '</div></div>' +
          '<div class="price">' + price + '</div></a>';
      }).join('');
      html += '<a class="all" data-kind="all" data-name="' + esc(q) + '" href="' + esc(searchHref(q)) + '">Tüm sonuçları gör (' + r.items.length + ')</a>';
    }
    $res.innerHTML = html;
  }

  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    var els = [].slice.call($res.querySelectorAll('.item, .catres'));
    if (e.key === 'ArrowDown') sel = Math.min(sel + 1, els.length - 1);
    else if (e.key === 'ArrowUp') sel = Math.max(sel - 1, -1);
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (!$q.value.trim()) return;
      if (sel >= 0 && els[sel]) els[sel].click();
      else { track('all', $q.value); location.href = searchHref($q.value.trim()); }
      return;
    } else return;
    e.preventDefault();
    els.forEach(function (el, i) { el.classList.toggle('sel', i === sel); });
    if (els[sel]) els[sel].scrollIntoView({ block: 'nearest' });
  }

  function track(kind, name) {
    try {
      (window.dataLayer = window.dataLayer || []).push({ event: 'pm_search', search_action: kind, search_term: $q.value, search_target: name });
    } catch (e) {}
  }

  // ---------------- Aç / kapat ----------------
  var prevOverflow = '';
  function open(initial) {
    if (!host) build();
    if (!isOpen) {
      isOpen = true;
      $ov.classList.add('on');
      prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      try { history.pushState({ pmSearch: 1 }, ''); pushed = true; } catch (e) {}
    }
    if (typeof initial === 'string' && initial) $q.value = initial;
    $q.focus();
    render();
    renderIdle();
    load().then(function () { renderIdle(); render(); }, function () {
      $idle.innerHTML = '<div class="msg"><b>Arama şu an yüklenemedi</b>Lütfen sayfayı yenileyip tekrar deneyin.</div>';
    });
  }

  function close(fromHistory) {
    if (!isOpen) return;
    isOpen = false;
    $ov.classList.remove('on');
    document.documentElement.style.overflow = prevOverflow;
    $q.blur();
    if (pushed && fromHistory !== true) { pushed = false; try { history.back(); } catch (e) {} }
    pushed = false;
  }

  window.addEventListener('popstate', function () { if (isOpen) { pushed = false; close(true); } });

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

  // Veriyi boşta önceden indir (ilk açılış anında olsun)
  var idle = window.requestIdleCallback || function (f) { setTimeout(f, 2500); };
  idle(function () { load().catch(function () {}); });

  window.PMSearch = { open: open, close: close, search: function (q) { return load().then(function () { return search(q); }); } };
})();
