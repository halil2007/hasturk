// Ücretsiz hesaplama araçları (/araclar/…, ana sayfadaki hızlı net kâr): tamamen tarayıcıda çalışır, hiçbir yere veri göndermez.
// Formlar build.mjs + src/tools.mjs'ten gelir (form[data-calc]). Sayılar "1.234,56" ya da "1234.56" yazılabilir; sonuçlar tr-TR biçimindedir.
// Kural (panelle aynı, panel/public/profit.js): tutarlar KDV dahil; stopaj satışın KDV hariç tutarı üzerinden.
// Komisyon oranı "KDV hariç" seçiliyse kesilen oran = oran × 1,20 (komisyon faturasına %20 KDV eklenir).
// Kategori seçici: resmî liste (assets/komisyon-<pazaryeri>.json) yalnız seçici kullanılınca yüklenir. Oran tablosu sayfasında satır araması.
// Paylaş: değişen alanlar adres satırına (?price=…&com=…&kat=…) yazılır; açılınca aynı hesap gelir. Değerler sunucuya gitmez.
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  // "1.234,56" → 1234.56 · "1234.56" → 1234.56 · "1,5" → 1.5 · "1.234" → 1234 (Türkçe binlik) · "0.5" → 0.5
  const num = (v) => {
    let s = String(v ?? '').replace(/[\s ₺%]/g, '').replace(/[−–]/g, '-');
    if (/[^\d.,-]/.test(s)) return NaN;
    if (!s || s === '-') return NaN;
    const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
    if (c > -1 && d > -1) s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (c > -1) s = (s.match(/,/g).length > 1) ? s.replace(/,/g, '') : s.replace(',', '.');
    else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  };
  const nf = (n, min = 2, max = 2) => Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: min, maximumFractionDigits: max });
  const sign = (n) => (n < 0 && Math.abs(n) >= 0.005 ? '−' : '');
  const tl = (n) => (Number.isFinite(n) ? `${sign(n)}${nf(n)} ₺` : '–');
  const neg = (n) => (Number.isFinite(n) ? (Math.abs(n) < 0.005 ? '0,00 ₺' : `−${nf(n)} ₺`) : '–');
  const pct = (n) => (Number.isFinite(n) ? `${n < 0 && Math.abs(n) >= 0.005 ? '−' : ''}%${nf(n, 0, 2)}` : '–');
  const plain = (n, max = 2) => (Number.isFinite(n) ? `${sign(n)}${nf(n, 0, max)}` : '–');
  const fold = (s) => String(s).toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' })[c]).replace(/\s+/g, ' ').trim();
  const params = new URLSearchParams(location.search);
  window.HT_TOOLS = { num, tl, pct, fold }; // testler için

  // Komisyon oranının KDV dahil karşılığı ve açıklama satırı
  const rateOf = (v) => { const c = v('com'), b = v.form.elements.basis; const ex = b ? b.value === 'ex' : false; return Number.isFinite(c) ? { raw: c, eff: ex ? c * 1.2 : c, ex } : null; };
  const rateText = (r, f) => {
    if (!r) return '';
    const cp = f._cp && f._cp.sel && !f._cp.manual ? 'Resmî oran' : 'Komisyon oranı';
    return r.ex ? `${cp} %${nf(r.raw, 0, 2)} (KDV hariç) → kesilen %${nf(r.eff, 0, 2)} (KDV dahil)` : `${cp} %${nf(r.raw, 0, 2)} (KDV dahil, olduğu gibi kesilir)`;
  };

  const calcs = {
    kdv(f, v, o) {
      const add = f.elements.mode.value === 'add', a = v('amount'), r = vatOf(f, v);
      o('amountLabel', add ? 'KDV hariç tutar' : 'KDV dahil tutar');
      if (!Number.isFinite(a)) return blank(f, 'Tutarı girin');
      if (!Number.isFinite(r)) return blank(f, 'KDV oranını girin');
      const net = add ? a : a / (1 + r / 100), gross = add ? a * (1 + r / 100) : a;
      o('bigLabel', add ? 'KDV dahil fiyat' : 'KDV hariç fiyat'); o('big', tl(add ? gross : net)); o('bigSub', `%${nf(r, 0, 2)} KDV: ${tl(gross - net)}`);
      o('net', tl(net)); o('vat', tl(gross - net)); o('gross', tl(gross));
    },
    desi(f, v, o) {
      const div = num(f.elements.div.value) || 3000;
      let tDesi = 0, tKg = 0, tCh = 0, tUp = 0, byDesi = 0, byKg = 0, ok = false;
      $$('[data-row]', f).forEach((row, i) => {
        const g = (k) => num($(`[name="${k}"]`, row).value);
        const en = g('en'), boy = g('boy'), yuk = g('yuk'), kg = g('kg') || 0, n = Math.max(1, Math.round(g('adet')) || 1);
        $('[data-n]', row).textContent = i + 1;
        const desi = en > 0 && boy > 0 && yuk > 0 ? (en * boy * yuk) / div : NaN;
        if (!Number.isFinite(desi) && !(kg > 0)) { $('[data-r="desi"]', row).textContent = '–'; $('[data-r="charge"]', row).textContent = '–'; return; }
        const d = Number.isFinite(desi) ? desi : 0, ch = Math.max(d, kg);
        ok = true; tDesi += d * n; tKg += kg * n; tCh += ch * n; tUp += Math.ceil(ch - 1e-9) * n;
        if (d >= kg) byDesi++; else byKg++;
        $('[data-r="desi"]', row).textContent = Number.isFinite(desi) ? plain(desi) : '–';
        $('[data-r="charge"]', row).textContent = `${plain(ch)} ${d >= kg ? 'desi' : 'kg'}${n > 1 ? ` × ${n}` : ''}`;
      });
      if (!ok) return blank(f, 'Koli ölçülerini girin');
      o('big', `${plain(tCh)} ${byKg ? (byDesi ? 'desi/kg' : 'kg') : 'desi'}`);
      o('bigSub', byKg && byDesi ? 'Kolilerin bir kısmı desiden, bir kısmı kilogramdan ücretlendirilir' : byKg ? 'Ağırlık desiden büyük: ücret kilogramdan hesaplanır' : 'Desi ağırlıktan büyük: ücret desiden hesaplanır');
      o('desi', plain(tDesi)); o('kg', `${plain(tKg)} kg`); o('up', plain(tUp, 0));
    },
    yuzde(f, v, o) {
      const x = v('p1x'), y = v('p1y'); o('p1t', `${plain(x)} × %${plain(y)} =`); o('p1', plain((x * y) / 100));
      const a = v('p2a'), b = v('p2b'); o('p2t', `${plain(a)} ÷ ${plain(b)} =`); o('p2', b ? `%${plain((a / b) * 100)}` : '–');
      const e = v('p3a'), n = v('p3b'), ch = e ? ((n - e) / Math.abs(e)) * 100 : NaN;
      o('p3t', !Number.isFinite(ch) ? 'Değişim' : ch > 0 ? 'Artış' : ch < 0 ? 'Azalış' : 'Değişim yok'); o('p3', Number.isFinite(ch) ? `%${plain(Math.abs(ch))}` : '–'); o('p3d', Number.isFinite(ch) ? `Fark: ${sign(n - e)}${nf(n - e, 0, 2)}` : '');
      const p = v('p4p'), d = v('p4d'), np = p * (1 - d / 100); o('p4', tl(np)); o('p4s', Number.isFinite(np) ? `Kazancınız: ${tl(p - np)}` : '');
    },
    satis(f, v, o) {
      const mode = f.elements.mode.value;
      $$('[data-mode]', f).forEach((el) => { el.hidden = el.dataset.mode !== mode; });
      const k = costsOf(v), cost = v('cost') || 0;
      if (!k) return blank(f, 'Komisyon oranını girin');
      o('rateLine', rateText(rateOf(v), f));
      let P;
      if (mode === 'price') {
        const T = v('target') || 0, tt = f.elements.tt.value, m = tt === 'm' ? T / 100 : 0, denom = 1 - k.c - k.w - m;
        if (denom <= 0) { blank(f); o('bigLabel', 'Önerilen satış fiyatı'); o('big', 'Bu hedefe ulaşılamaz'); o('bigSub', 'Komisyon + stopaj + hedef marj %100\'e ulaşıyor'); return; }
        P = (cost + k.ship + k.fee + (tt === 't' ? T : 0)) / denom;
      } else P = v('price');
      if (!Number.isFinite(P) || P <= 0) return blank(f, 'Satış fiyatını girin');
      const r = profitOf(P, cost, k);
      o('bigLabel', mode === 'price' ? 'Önerilen satış fiyatı' : 'Ürün başı net kâr');
      o('big', mode === 'price' ? tl(P) : tl(r.profit)); o('bigSub', mode === 'price' ? `Net kâr ${tl(r.profit)} · marj ${pct(r.margin)}` : `Satış ${tl(P)} · marj ${pct(r.margin)}`);
      o('com', neg(r.com)); o('ship', neg(k.ship + k.fee)); o('wh', neg(r.wh)); o('payout', tl(r.payout)); o('profit', tl(r.profit));
      o('margin', pct(r.margin)); o('markup', cost > 0 ? pct((r.profit / cost) * 100) : '–'); o('be', tl(breakEven(cost, k)));
      barOf(f, P, { com: r.com, ship: k.ship, fee: k.fee, wh: r.wh, cost, profit: r.profit });
      flag(f, r.profit);
    },
    stopaj(f, v, o) {
      const a = v('amount'), r = vatOf(f, v), w = v('wh');
      if (!Number.isFinite(a)) return blank(f, 'Satış tutarını girin');
      if (!Number.isFinite(r) || !Number.isFinite(w)) return blank(f, 'Oranları girin');
      const base = a / (1 + r / 100), st = (base * w) / 100;
      o('big', tl(st)); o('bigSub', `${tl(base)} × %${nf(w, 0, 2)}`); o('base', tl(base)); o('vatAmt', tl(a - base)); o('after', tl(a - st));
    },
    komisyon(f, v, o) {
      const k = costsOf(v), P = v('price'), cost = v('cost');
      o('rateLine', rateText(rateOf(v), f));
      if (!Number.isFinite(P) || P <= 0) return blank(f, 'Satış fiyatını girin');
      if (!k) return blank(f, f._cp && !f._cp.sel ? 'Kategori seçin ya da oran girin' : 'Komisyon oranını girin');
      const r = profitOf(P, cost || 0, k);
      o('big', tl(r.payout)); o('bigSub', `Toplam kesinti ${tl(P - r.payout)} (satışın ${pct(P ? ((P - r.payout) / P) * 100 : 0)}'i)`);
      o('com', `${neg(r.com)} · %${nf(k.c * 100, 0, 2)}`); o('ship', neg(k.ship)); o('fee', neg(k.fee)); o('wh', neg(r.wh)); o('cut', neg(P - r.payout));
      const has = Number.isFinite(cost);
      o('profit', has ? tl(r.profit) : 'Alış maliyetini girin'); o('margin', has ? pct(r.margin) : '–');
      barOf(f, P, { com: r.com, ship: k.ship, fee: k.fee, wh: r.wh, cost: has ? cost : 0, profit: has ? r.profit : r.payout }, !has);
      flag(f, has ? r.profit : 1);
    },
    karsilastir(f, v, o) {
      const P = v('price'), cost = v('cost') || 0, w = (v('wh') || 0) / 100 / (1 + (num(f.elements.vat.value) || 0) / 100);
      let best = null;
      $$('[data-ch]', f).forEach((card) => {
        const g = (n) => num($(`[name="${n}"]`, card).value), on = $('[name="on"]', card).checked;
        card.classList.toggle('off', !on); $('[data-best]', card).hidden = true; card.classList.remove('best', 'loss');
        const k = { c: ((g('com') || 0) * 1.2) / 100, ship: g('ship') || 0, fee: g('fee') || 0, w };
        const r = Number.isFinite(P) && P > 0 ? profitOf(P, cost, k) : null;
        $('[data-r="payout"]', card).textContent = r ? tl(r.payout) : '–';
        $('[data-r="profit"]', card).textContent = r ? tl(r.profit) : '–';
        $('[data-r="margin"]', card).textContent = r ? pct(r.margin) : '–';
        if (r && r.profit < 0) card.classList.add('loss');
        if (r && on && (!best || r.profit > best.r.profit)) best = { card, r, name: $('.cmp-h b', card).textContent };
      });
      if (!best) { o('big', Number.isFinite(P) ? 'Bir kanal seçin' : 'Satış fiyatını girin'); o('bigSub', ''); return; }
      best.card.classList.add('best'); $('[data-best]', best.card).hidden = false;
      o('big', `${best.name} · ${tl(best.r.profit)}`); o('bigSub', `Hakediş ${tl(best.r.payout)} · marj ${pct(best.r.margin)}`);
    },
    indirim(f, v, o) {
      const k = costsOf(v), P = v('price'), d = v('disc') || 0, cost = v('cost') || 0;
      if (!Number.isFinite(P) || P <= 0) return blank(f, 'Satış fiyatını girin');
      if (!k) return blank(f, 'Komisyon oranını girin');
      const np = P * (1 - d / 100), a = profitOf(P, cost, k), b = profitOf(np, cost, k), be = breakEven(cost, k);
      o('big', tl(b.profit)); o('bigSub', `${tl(np)} fiyatta · marj ${pct(b.margin)}`);
      o('newPrice', tl(np)); o('before', tl(a.profit)); o('after', tl(b.profit));
      o('drop', `${tl(b.profit - a.profit)}${a.profit > 0 ? ` (${pct(((b.profit - a.profit) / a.profit) * 100)})` : ''}`);
      o('be', tl(be)); o('maxDisc', Number.isFinite(be) ? (be < P ? pct((1 - be / P) * 100) : 'İndirimsiz fiyatta bile kâr yok') : '–');
      o('need', a.profit > 0 && b.profit > 0 ? (b.profit < a.profit ? `%${nf((a.profit / b.profit - 1) * 100, 0, 1)} daha fazla satış` : 'Gerekmez') : b.profit <= 0 ? 'İndirimli fiyatta zarar ediyorsunuz' : '–');
      flag(f, b.profit);
    },
    mini(f, v, o) {
      const P = v('price'), k = { c: ((v('com') || 0) * 1.2) / 100, ship: v('ship') || 0, fee: 0, w: 0.01 / 1.2 };
      if (!Number.isFinite(P) || P <= 0) return blank(f, 'Satış fiyatını girin');
      const r = profitOf(P, v('cost') || 0, k);
      o('big', tl(r.profit)); o('bigSub', `Komisyon ${tl(r.com)} · stopaj ${tl(r.wh)}`); o('payout', tl(r.payout)); o('margin', pct(r.margin));
      flag(f, r.profit);
    },
  };
  // Ortak: komisyon (oran türü KDV hariçse ×1,2), kargo, hizmet bedeli, stopaj (KDV hariç satış üzerinden)
  function costsOf(v) {
    const r = rateOf(v), ship = v('ship') || 0, fee = v('fee') || 0, w = v('wh') || 0, vat = v('vat');
    if (!r) return null;
    return { c: r.eff / 100, ship, fee, w: w / 100 / (1 + (Number.isFinite(vat) ? vat : 20) / 100) };
  }
  function profitOf(P, cost, k) {
    const com = P * k.c, wh = P * k.w, payout = P - com - k.ship - k.fee - wh, profit = payout - cost;
    return { com, wh, payout, profit, margin: P ? (profit / P) * 100 : 0 };
  }
  const breakEven = (cost, k) => { const d = 1 - k.c - k.w; return d > 0 ? (cost + k.ship + k.fee) / d : NaN; };
  const vatOf = (f, v) => { const el = f.elements.vat; const val = el && (el.value ?? ''); return val === 'x' ? v('vatX') : num(val); };
  // Boş / hatalı giriş: sonuç alanları "–", büyük sonuçta ne eksik olduğu yazar
  const blank = (f, msg) => {
    $$('[data-o]', f).forEach((el) => { if (!/Label$|^p\dt$|^rateLine$/.test(el.dataset.o)) el.textContent = '–'; });
    if (msg) $$('[data-o="big"]', f).forEach((el) => { el.textContent = msg; });
    f.classList.add('is-empty'); f.classList.remove('is-loss');
    const w = $('[data-barw]', f); if (w) w.hidden = true;
  };
  const flag = (f, p) => { f.classList.remove('is-empty'); f.classList.toggle('is-loss', Number.isFinite(p) && p < 0); };
  // Satış fiyatının dağılımı: komisyon · kargo · hizmet · stopaj · alış · kâr (zarar varsa kâr dilimi gösterilmez)
  function barOf(f, P, parts, noCost) {
    const w = $('[data-barw]', f); if (!w) return;
    if (!(P > 0)) { w.hidden = true; return; }
    w.hidden = false;
    const sh = (n) => Math.max(0, n) / P * 100;
    Object.entries(parts).forEach(([k, n]) => {
      const seg = $(`[data-k="${k}"]`, w), li = $(`[data-l="${k}"]`, w), on = n > 0.004 && !(noCost && k === 'cost');
      seg.style.width = `${on ? sh(n) : 0}%`; li.hidden = !on;
      $(`[data-bl="${k}"]`, w).textContent = on ? `%${nf(sh(n), 0, 1)}` : '';
    });
    $('[data-l="profit"]', w).firstChild.nextSibling.textContent = noCost ? 'Hakediş ' : 'Kâr ';
  }

  // ---------- kategori seçici (resmî liste; yalnız kullanılınca yüklenir) ----------
  const cache = {};
  const loadList = (src) => (cache[src] ||= fetch(src, { credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => ({ d, rows: d.cats.map(([p, r]) => ({ p, r, f: fold(p), leaf: fold(p.split(' > ').pop()) })) })));
  function setupPicker(f, run) {
    const box = $('[data-cp]', f); if (!box) return;
    const srcs = JSON.parse(box.dataset.srcs || '{}'), q = $('#cp-q', box), list = $('#cp-list', box), st = $('[data-cp-st]', box), clr = $('[data-cp-clear]', box), cap = $('[data-cp-cap]', box);
    const cp = f._cp = { sel: null, manual: false, mp: null, list: null, items: [], i: -1 };
    const chEl = f.elements.ch;
    const curMp = () => (f.dataset.preset || (chEl && chEl.value) || '');
    const info = () => srcs[cp.mp];
    const status = () => {
      const s = info(); if (!s) { st.textContent = ''; return; }
      if (cp.sel) st.innerHTML = '';
      const pc = (n) => `%${nf(n, 0, 2)}`;
      if (cp.sel) {
        const ex = cp.list.d.basis === 'kdv-haric', parts = cp.sel.p.split(' > ');
        st.append(Object.assign(document.createElement('span'), { className: 'cp-path', textContent: parts.join(' › ') }));
        st.append(Object.assign(document.createElement('span'), { className: 'cp-rate', textContent: cp.manual ? `Elle girilen oran kullanılıyor (resmî oran ${pc(cp.sel.r)}${ex ? ' + KDV' : ''})` : `Resmî oran ${pc(cp.sel.r)}${ex ? ` (KDV hariç) → kesilen ${pc(cp.sel.r * 1.2)} (KDV dahil)` : ' (KDV dahil)'}` }));
      } else st.textContent = `${s.name} resmî listesindeki ${s.count.toLocaleString('tr-TR')} kategoriden seçin ya da oranı elle girin. Liste tarihi: ${s.date}.`;
    };
    const sync = () => {
      const mp = curMp(); box.hidden = !srcs[mp];
      if (mp !== cp.mp) { cp.mp = mp; cp.sel = null; cp.manual = false; cp.list = null; q.value = ''; clr.hidden = true; close(); }
      if (cap) cap.textContent = srcs[mp] ? `(${srcs[mp].name} resmî listesi)` : '';
      status();
    };
    const ensure = () => { const s = info(); if (!s) return Promise.reject(new Error('liste yok')); return loadList(s.src).then((l) => { if (curMp() === cp.mp) cp.list = l; return l; }); };
    const close = () => { list.hidden = true; q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); cp.i = -1; };
    const hl = (i) => {
      const els = $$('[role="option"]', list); if (!els.length) return;
      cp.i = (i + els.length) % els.length;
      els.forEach((el, k) => el.setAttribute('aria-selected', String(k === cp.i)));
      q.setAttribute('aria-activedescendant', els[cp.i].id); els[cp.i].scrollIntoView({ block: 'nearest' });
    };
    const render = () => {
      if (!cp.list) return;
      const t = fold(q.value).split(' ').filter(Boolean);
      let rows = cp.list.rows;
      if (t.length) rows = rows.filter((x) => t.every((w) => x.f.includes(w))).sort((a, b) => (t.every((w) => b.leaf.includes(w)) - t.every((w) => a.leaf.includes(w))) || a.p.length - b.p.length);
      cp.items = rows.slice(0, 60);
      list.textContent = '';
      if (!cp.items.length) { const li = document.createElement('li'); li.className = 'cp-none'; li.textContent = 'Eşleşen kategori yok. Başka bir kelime deneyin ya da oranı elle girin.'; list.append(li); }
      cp.items.forEach((x, i) => {
        const li = document.createElement('li'), parts = x.p.split(' > ');
        li.id = `cp-o${i}`; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', 'false'); li.dataset.i = i;
        const n = document.createElement('span'); n.className = 'cp-n';
        const b = document.createElement('b'); b.textContent = parts.pop(); n.append(b);
        if (parts.length) { const s = document.createElement('small'); s.textContent = parts.join(' › '); n.append(s); }
        const r = document.createElement('em'); r.textContent = `%${nf(x.r, 0, 2)}${cp.list.d.basis === 'kdv-haric' ? ' + KDV' : ''}`;
        li.append(n, r); list.append(li);
      });
      if (rows.length > cp.items.length) { const li = document.createElement('li'); li.className = 'cp-none'; li.textContent = `${rows.length - cp.items.length} kategori daha var; aramayı daraltın.`; list.append(li); }
      list.hidden = false; q.setAttribute('aria-expanded', 'true'); cp.i = -1;
    };
    const open = () => { st.dataset.loading = '1'; ensure().then(() => { delete st.dataset.loading; render(); }).catch(() => { delete st.dataset.loading; st.textContent = 'Kategori listesi yüklenemedi; oranı elle girin.'; }); };
    const pick = (x) => {
      cp.sel = x; cp.manual = false; q.value = x.p.split(' > ').pop(); clr.hidden = false; close();
      f.elements.com.value = nf(x.r, 0, 2);
      if (f.elements.basis) f.elements.basis.value = cp.list.d.basis === 'kdv-haric' ? 'ex' : 'inc';
      status(); run();
    };
    q.addEventListener('focus', open);
    q.addEventListener('input', (e) => { e.stopPropagation(); if (cp.sel && fold(q.value) !== fold(cp.sel.p.split(' > ').pop())) { cp.sel = null; clr.hidden = !q.value; status(); } open(); });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) open(); else hl(cp.i + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); hl(cp.i - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (!list.hidden && cp.items.length) pick(cp.items[Math.max(0, cp.i)]); }
      else if (e.key === 'Escape') { if (!list.hidden) { e.preventDefault(); e.stopPropagation(); close(); } }
      else if (e.key === 'Tab') close();
    });
    list.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => { const li = e.target.closest('[role="option"]'); if (li) pick(cp.items[+li.dataset.i]); });
    q.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== q) close(); }, 120));
    clr.addEventListener('click', () => { cp.sel = null; cp.manual = false; q.value = ''; clr.hidden = true; status(); run(); q.focus(); });
    // Oran elle değiştirilirse seçili kategori korunur ama "elle girilen" olarak işaretlenir
    f.addEventListener('input', (e) => { if (cp.sel && (e.target.name === 'com' || e.target.name === 'basis')) { cp.manual = true; status(); run(); } });
    if (chEl) chEl.addEventListener('change', sync);
    cp.reset = () => { cp.sel = null; cp.manual = false; q.value = ''; clr.hidden = true; status(); };
    // Paylaşılan bağlantı: ?kat=<yol>
    cp.restore = (path, keepRate) => ensure().then((l) => { const x = l.rows.find((r) => r.p === path); if (!x) return; const com = f.elements.com.value, basis = f.elements.basis && f.elements.basis.value; pick(x); if (keepRate) { f.elements.com.value = com; if (basis) f.elements.basis.value = basis; cp.manual = num(com) !== x.r; status(); run(); } }).catch(() => {});
    sync();
  }

  // ---------- paylaş / yazdır / sıfırla ----------
  const fieldsOf = (f) => $$('input[name], select[name]', f).filter((el) => el.name && el.type !== 'button');
  function share(f) {
    const p = new URLSearchParams(), names = [...new Set(fieldsOf(f).map((el) => el.name))];
    for (const n of names) {
      const els = fieldsOf(f).filter((el) => el.name === n);
      if (els[0].type === 'radio') { const c = els.find((el) => el.checked); if (c && !c.defaultChecked) p.set(n, c.value); continue; }
      if (els[0].type === 'checkbox') { if (els.length === 1) { if (els[0].checked !== els[0].defaultChecked) p.set(n, els[0].checked ? '1' : '0'); } else { const v = els.map((el) => (el.checked ? 1 : 0)).join('~'); if (els.some((el) => el.checked !== el.defaultChecked)) p.set(n, v); } continue; }
      const vals = els.map((el) => el.value.trim()), changed = els.some((el) => (el.tagName === 'SELECT' ? !el.options[el.selectedIndex]?.defaultSelected : el.value !== el.defaultValue)) || els.length > 1 && $('[data-rows]', f);
      if (changed) p.set(n, vals.join('~'));
    }
    if (f._cp && f._cp.sel) p.set('kat', f._cp.sel.p);
    const url = `${location.origin}${location.pathname}${p.toString() ? `?${p}` : ''}`;
    try { history.replaceState(null, '', url); } catch (e) { /* yok */ }
    const done = (ok) => { const l = $('[data-share-l]', f); if (!l) return; l.textContent = ok ? 'Bağlantı kopyalandı' : 'Adres satırından kopyalayın'; clearTimeout(l._t); l._t = setTimeout(() => { l.textContent = 'Bağlantıyı kopyala'; }, 2400); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(() => done(true), () => done(false)); else done(false);
  }
  function restore(f, run) {
    if (f.dataset.calc === 'mini' || ![...params.keys()].length) return;
    const rows = $('[data-rows]', f);
    if (rows) { const n = Math.min(20, Math.max(...['en', 'boy', 'yuk', 'kg', 'adet'].map((k) => (params.get(k) || '').split('~').length))); while ($$('[data-row]', rows).length < n) $('[data-add]', f).click(); }
    for (const [n, val] of params) {
      if (n === 'kat') continue;
      const els = fieldsOf(f).filter((el) => el.name === n); if (!els.length) continue;
      if (els[0].type === 'radio') { const r = els.find((el) => el.value === val); if (r) r.checked = true; continue; }
      const parts = val.split('~');
      els.forEach((el, i) => { const x = parts[i] ?? parts[0]; if (el.type === 'checkbox') el.checked = x === '1'; else if (el.tagName === 'SELECT') { if ([...el.options].some((o) => o.value === x)) el.value = x; } else el.value = x.slice(0, 40); });
    }
    if (f.elements.ch) f.elements.ch.dispatchEvent(new Event('change'));
    if (params.get('kat') && f._cp && f._cp.restore) f._cp.restore(params.get('kat'), params.has('com'));
    run();
  }

  $$('form[data-calc]').forEach((f) => {
    const fn = calcs[f.dataset.calc]; if (!fn) return;
    const v = (name) => { const el = f.elements[name]; if (!el) return NaN; return num(el.value ?? ''); };
    v.form = f;
    const o = (k, text) => $$(`[data-o="${k}"]`, f).forEach((el) => { el.textContent = text; });
    // Hatalı sayı: alanın altında uyarı (boş alan hata değildir)
    const check = () => $$('input[inputmode="decimal"]', f).forEach((el) => {
      const bad = el.value.trim() !== '' && !Number.isFinite(num(el.value)), err = $('[data-err]', el.closest('.cf'));
      el.classList.toggle('bad', bad); if (bad) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
      if (err) err.hidden = !bad;
    });
    const run = () => {
      // "Diğer" KDV oranı seçilince oran kutusu açılır
      const vx = $('.cf-x', f); if (vx) { const on = f.elements.vat.value === 'x'; if (vx.hidden === on) { vx.hidden = !on; if (on) $('input', vx).focus(); } }
      check();
      try { fn(f, v, o); } catch (e) { blank(f, 'Değerleri kontrol edin'); }
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); run(); });
    f.addEventListener('input', run);
    f.addEventListener('change', (e) => {
      // Kanal seçilince örnek oranı gelir (KDV hariç)
      if (e.target.name === 'ch') { const opt = e.target.selectedOptions[0]; if (opt && opt.dataset.rate) { f.elements.com.value = Number(opt.dataset.rate).toLocaleString('tr-TR'); if (f.elements.basis) f.elements.basis.value = 'ex'; } }
      run();
    });
    // Alandan çıkınca sayı Türkçe biçimde yazılır (1234.5 → 1.234,5)
    f.addEventListener('focusout', (e) => {
      const el = e.target; if (!el.matches('input[inputmode="decimal"]') || !el.value.trim()) return;
      const n = num(el.value); if (Number.isFinite(n)) el.value = n.toLocaleString('tr-TR', { maximumFractionDigits: 4 });
    });
    // Desi: koli ekle / kaldır
    const rows = $('[data-rows]', f);
    if (rows) {
      const sync = () => { const all = $$('[data-row]', rows); all.forEach((r) => { $('[data-del]', r).hidden = all.length < 2; }); };
      $('[data-add]', f).addEventListener('click', () => {
        const last = $$('[data-row]', rows).pop(), c = last.cloneNode(true);
        rows.appendChild(c); sync(); run(); if (document.activeElement && f.contains(document.activeElement)) $('input', c).focus();
      });
      rows.addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (!b) return; b.closest('[data-row]').remove(); sync(); run(); });
      sync();
    }
    setupPicker(f, run);
    f.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-share], button[data-print], button[data-reset]'); if (!b) return;
      if (b.matches('[data-share]')) share(f);
      else if (b.matches('[data-print]')) window.print();
      else {
        f.reset(); if (rows) $$('[data-row]', rows).slice(1).forEach((r) => r.remove());
        if (f._cp && f._cp.reset) f._cp.reset();
        if (f.elements.ch) f.elements.ch.dispatchEvent(new Event('change'));
        try { history.replaceState(null, '', location.pathname); } catch (er) { /* yok */ }
        run();
      }
    });
    run();
    restore(f, run);
  });

  // ---------- oran tablosu sayfası: satır araması ----------
  const rq = $('[data-rt-q]');
  if (rq) {
    const rows = $$('tr[data-q]').map((tr) => ({ tr, f: fold(tr.dataset.q) })), groups = $$('[data-rt-g]'), st = $('[data-rt-st]');
    const go = () => {
      const t = fold(rq.value).split(' ').filter(Boolean); let n = 0;
      rows.forEach((r) => { const on = t.every((w) => r.f.includes(w)); r.tr.hidden = !on; if (on) n++; });
      groups.forEach((g) => { g.hidden = !$$('tr[data-q]', g).some((tr) => !tr.hidden); });
      st.textContent = t.length ? (n ? `${n.toLocaleString('tr-TR')} kategori bulundu` : 'Eşleşen kategori yok') : '';
    };
    rq.addEventListener('input', go);
    if (params.get('q')) { rq.value = params.get('q'); go(); }
  }
})();
