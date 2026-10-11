// Ücretsiz hesaplama araçları (/araclar/…, ana sayfadaki hızlı net kâr): tamamen tarayıcıda çalışır, hiçbir yere veri göndermez.
// Formlar build.mjs + src/tools.mjs'ten gelir (form[data-calc]). Sayılar "1.234,56" ya da "1234.56" yazılabilir; sonuçlar tr-TR biçimindedir.
// Kural (panelle aynı, panel/public/profit.js): tutarlar KDV dahil; stopaj satışın KDV hariç tutarı üzerinden.
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  // "1.234,56" → 1234.56 · "1234.56" → 1234.56 · "1,5" → 1.5 · "1.234" → 1234 (Türkçe binlik) · "0.5" → 0.5
  const num = (v) => {
    let s = String(v ?? '').replace(/[\s ₺%]/g, '').replace(/[−–]/g, '-').replace(/[^\d.,-]/g, '');
    if (!s || s === '-') return NaN;
    const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
    if (c > -1 && d > -1) s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (c > -1) s = (s.match(/,/g).length > 1) ? s.replace(/,/g, '') : s.replace(',', '.');
    else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : NaN;
  };
  const nf = (n, min = 2, max = 2) => Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: min, maximumFractionDigits: max });
  const sign = (n) => (n < 0 && Math.abs(n) >= 0.005 ? '−' : '');
  const tl = (n) => (Number.isFinite(n) ? `${sign(n)}${nf(n)} ₺` : '–');
  const neg = (n) => (Number.isFinite(n) ? (Math.abs(n) < 0.005 ? '0,00 ₺' : `−${nf(n)} ₺`) : '–');
  const pct = (n) => (Number.isFinite(n) ? `${n < 0 && Math.abs(n) >= 0.005 ? '−' : ''}%${nf(n, 0, 2)}` : '–');
  const plain = (n, max = 2) => (Number.isFinite(n) ? `${sign(n)}${nf(n, 0, max)}` : '–');
  window.HT_TOOLS = { num, tl, pct }; // testler için

  const calcs = {
    kdv(f, v, o) {
      const add = f.elements.mode.value === 'add', a = v('amount'), r = vatOf(f, v);
      o('amountLabel', add ? 'KDV hariç tutar' : 'KDV dahil tutar');
      if (!Number.isFinite(a) || !Number.isFinite(r)) return blank(f);
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
      if (!ok) return blank(f);
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
      if (!k) return blank(f);
      let P;
      if (mode === 'price') {
        const T = v('target') || 0, tt = f.elements.tt.value, m = tt === 'm' ? T / 100 : 0, denom = 1 - k.c - k.w - m;
        if (denom <= 0) { blank(f); o('bigLabel', 'Önerilen satış fiyatı'); o('big', 'Bu hedefe ulaşılamaz'); o('bigSub', 'Komisyon + stopaj + hedef marj %100\'e ulaşıyor'); return; }
        P = (cost + k.ship + k.fee + (tt === 't' ? T : 0)) / denom;
      } else P = v('price');
      if (!Number.isFinite(P) || P <= 0) return blank(f);
      const r = profitOf(P, cost, k);
      o('bigLabel', mode === 'price' ? 'Önerilen satış fiyatı' : 'Ürün başı net kâr');
      o('big', mode === 'price' ? tl(P) : tl(r.profit)); o('bigSub', mode === 'price' ? `Net kâr ${tl(r.profit)} · marj ${pct(r.margin)}` : `Satış ${tl(P)} · marj ${pct(r.margin)}`);
      o('com', neg(r.com)); o('ship', neg(k.ship + k.fee)); o('wh', neg(r.wh)); o('payout', tl(r.payout)); o('profit', tl(r.profit));
      o('margin', pct(r.margin)); o('markup', cost > 0 ? pct((r.profit / cost) * 100) : '–'); o('be', tl(breakEven(cost, k)));
      flag(f, r.profit);
    },
    stopaj(f, v, o) {
      const a = v('amount'), r = vatOf(f, v), w = v('wh');
      if (!Number.isFinite(a) || !Number.isFinite(r) || !Number.isFinite(w)) return blank(f);
      const base = a / (1 + r / 100), st = (base * w) / 100;
      o('big', tl(st)); o('bigSub', `${tl(base)} × %${nf(w, 0, 2)}`); o('base', tl(base)); o('vatAmt', tl(a - base)); o('after', tl(a - st));
    },
    komisyon(f, v, o) {
      const k = costsOf(v), P = v('price'), cost = v('cost');
      if (!k || !Number.isFinite(P)) return blank(f);
      const r = profitOf(P, cost || 0, k);
      o('big', tl(r.payout)); o('bigSub', `Toplam kesinti ${tl(P - r.payout)} (satışın ${pct(P ? ((P - r.payout) / P) * 100 : 0)}'i)`);
      o('com', `${neg(r.com)} · %${nf(k.c * 100, 0, 2)}`); o('ship', neg(k.ship)); o('fee', neg(k.fee)); o('wh', neg(r.wh)); o('cut', neg(P - r.payout));
      const has = Number.isFinite(cost);
      o('profit', has ? tl(r.profit) : 'Alış maliyetini girin'); o('margin', has ? pct(r.margin) : '–');
      flag(f, has ? r.profit : 1);
    },
    karsilastir(f, v, o) {
      const P = v('price'), cost = v('cost') || 0, w = (v('wh') || 0) / 100 / (1 + (num(f.elements.vat.value) || 0) / 100);
      let best = null;
      $$('[data-ch]', f).forEach((card) => {
        const g = (n) => num($(`[name="${n}"]`, card).value), on = $('[name="on"]', card).checked;
        card.classList.toggle('off', !on); $('[data-best]', card).hidden = true; card.classList.remove('best', 'loss');
        const k = { c: (g('com') || 0) / 100, ship: g('ship') || 0, fee: g('fee') || 0, w };
        const r = Number.isFinite(P) ? profitOf(P, cost, k) : null;
        $('[data-r="payout"]', card).textContent = r ? tl(r.payout) : '–';
        $('[data-r="profit"]', card).textContent = r ? tl(r.profit) : '–';
        $('[data-r="margin"]', card).textContent = r ? pct(r.margin) : '–';
        if (r && r.profit < 0) card.classList.add('loss');
        if (r && on && (!best || r.profit > best.r.profit)) best = { card, r, name: $('.cmp-h b', card).textContent };
      });
      if (!best) { o('big', '–'); o('bigSub', ''); return; }
      best.card.classList.add('best'); $('[data-best]', best.card).hidden = false;
      o('big', `${best.name} · ${tl(best.r.profit)}`); o('bigSub', `Hakediş ${tl(best.r.payout)} · marj ${pct(best.r.margin)}`);
    },
    indirim(f, v, o) {
      const k = costsOf(v), P = v('price'), d = v('disc') || 0, cost = v('cost') || 0;
      if (!k || !Number.isFinite(P) || P <= 0) return blank(f);
      const np = P * (1 - d / 100), a = profitOf(P, cost, k), b = profitOf(np, cost, k), be = breakEven(cost, k);
      o('big', tl(b.profit)); o('bigSub', `${tl(np)} fiyatta · marj ${pct(b.margin)}`);
      o('newPrice', tl(np)); o('before', tl(a.profit)); o('after', tl(b.profit));
      o('drop', `${tl(b.profit - a.profit)}${a.profit > 0 ? ` (${pct(((b.profit - a.profit) / a.profit) * 100)})` : ''}`);
      o('be', tl(be)); o('maxDisc', Number.isFinite(be) ? (be < P ? pct((1 - be / P) * 100) : 'İndirimsiz fiyatta bile kâr yok') : '–');
      o('need', a.profit > 0 && b.profit > 0 ? (b.profit < a.profit ? `%${nf((a.profit / b.profit - 1) * 100, 0, 1)} daha fazla satış` : 'Gerekmez') : b.profit <= 0 ? 'İndirimli fiyatta zarar ediyorsunuz' : '–');
      flag(f, b.profit);
    },
    mini(f, v, o) {
      const P = v('price'), k = { c: (v('com') || 0) / 100, ship: v('ship') || 0, fee: 0, w: 0.01 / 1.2 };
      if (!Number.isFinite(P)) return blank(f);
      const r = profitOf(P, v('cost') || 0, k);
      o('big', tl(r.profit)); o('bigSub', `Komisyon ${tl(r.com)} · stopaj ${tl(r.wh)}`); o('payout', tl(r.payout)); o('margin', pct(r.margin));
      flag(f, r.profit);
    },
  };
  // Ortak: komisyon (KDV dahil oran; "KDV hariç" işaretliyse ×1,2), kargo, hizmet bedeli, stopaj (KDV hariç satış üzerinden)
  function costsOf(v) {
    const c = v('com'), ship = v('ship') || 0, fee = v('fee') || 0, w = v('wh') || 0, vat = v('vat');
    if (!Number.isFinite(c)) return null;
    return { c: (c * (v.form.elements.exVat && v.form.elements.exVat.checked ? 1.2 : 1)) / 100, ship, fee, w: w / 100 / (1 + (Number.isFinite(vat) ? vat : 20) / 100) };
  }
  function profitOf(P, cost, k) {
    const com = P * k.c, wh = P * k.w, payout = P - com - k.ship - k.fee - wh, profit = payout - cost;
    return { com, wh, payout, profit, margin: P ? (profit / P) * 100 : 0 };
  }
  const breakEven = (cost, k) => { const d = 1 - k.c - k.w; return d > 0 ? (cost + k.ship + k.fee) / d : NaN; };
  const vatOf = (f, v) => { const el = f.elements.vat; const val = el && (el.value ?? ''); return val === 'x' ? v('vatX') : num(val); };
  const blank = (f) => $$('[data-o]', f).forEach((el) => { if (!/Label$|^p\dt$/.test(el.dataset.o)) el.textContent = '–'; });
  const flag = (f, p) => f.classList.toggle('is-loss', Number.isFinite(p) && p < 0);

  $$('form[data-calc]').forEach((f) => {
    const fn = calcs[f.dataset.calc]; if (!fn) return;
    const v = (name) => { const el = f.elements[name]; if (!el) return NaN; return num(el.value ?? ''); };
    v.form = f;
    const o = (k, text) => $$(`[data-o="${k}"]`, f).forEach((el) => { el.textContent = text; });
    const run = () => {
      // "Diğer" KDV oranı seçilince oran kutusu açılır
      const vx = $('.cf-x', f); if (vx) { const on = f.elements.vat.value === 'x'; if (vx.hidden === on) { vx.hidden = !on; if (on) $('input', vx).focus(); } }
      try { fn(f, v, o); } catch (e) { blank(f); }
    };
    f.addEventListener('submit', (e) => { e.preventDefault(); run(); });
    f.addEventListener('input', run);
    f.addEventListener('change', (e) => {
      // Kanal seçilince örnek oranı gelir (KDV dahil; "KDV hariç" işareti kalkar)
      if (e.target.name === 'ch') { const opt = e.target.selectedOptions[0]; if (opt && opt.dataset.rate) { f.elements.com.value = Number(opt.dataset.rate).toLocaleString('tr-TR'); if (f.elements.exVat) f.elements.exVat.checked = false; } }
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
        rows.appendChild(c); sync(); run(); $('input', c).focus();
      });
      rows.addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (!b) return; b.closest('[data-row]').remove(); sync(); run(); });
      sync();
    }
    run();
  });
})();
