// Kategori alanı: yazarken kayıtlı kategorilerden öneri (yolun herhangi bir parçasında arar), seçilince tam yol yazılır.
// "Bahçe > Tohum" yazılabilir; kaydederken "Bahçe › Tohum" biçimine çevrilir (aynı kategori iki kez oluşmaz).
import { api, n } from '../core.js';
import { normCat, catKey, CAT_SEP } from '../catpath.js';

let cache = null, at = 0;
const load = () => (cache && Date.now() - at < 60e3 ? cache : (at = Date.now(), cache = api('products/categories').catch(() => [])));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function attachCatPicker(input) {
  if (!input || input._cat) return;
  input._cat = true;
  input.setAttribute('autocomplete', 'off');
  const wrap = document.createElement('div');
  wrap.className = 'cat-pick';
  input.parentNode.insertBefore(wrap, input);
  wrap.append(input);
  const box = document.createElement('div');
  box.className = 'cat-pop hide';
  wrap.append(box);
  let items = [], sel = -1;
  const close = () => { box.classList.add('hide'); sel = -1; };
  const pick = (v) => { input.value = v; close(); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); };
  async function draw() {
    const all = await load();
    const raw = input.value, q = catKey(raw);
    // Tüm yollar + ara basamaklar (yalnız alt kategorisi olan üst kategori de seçilebilsin)
    const paths = new Map();
    for (const c of all) {
      const parts = normCat(c.name).split(CAT_SEP);
      for (let i = 1; i <= parts.length; i++) { const p = parts.slice(0, i).join(CAT_SEP); paths.set(p, (paths.get(p) || 0) + (i === parts.length ? c.n : 0)); }
    }
    const words = q.split(/\s*›\s*|\s+/).filter(Boolean);
    items = [...paths].filter(([p]) => { const k = catKey(p); return words.every((w) => k.includes(w)); })
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr')).slice(0, 12);
    const fresh = q && !paths.has(normCat(raw)) && ![...paths.keys()].some((p) => catKey(p) === q);
    if (!items.length && !fresh) { close(); return; }
    sel = Math.min(sel, items.length - 1);
    box.innerHTML = items.map(([p, c], i) => {
      const parts = p.split(CAT_SEP), leaf = parts.pop();
      return `<button type="button" class="cat-opt${i === sel ? ' on' : ''}" data-i="${i}"><span>${parts.length ? `<span class="muted">${esc(parts.join(CAT_SEP))} › </span>` : ''}<b>${esc(leaf)}</b></span>${c ? `<span class="muted tiny">${n(c)} ürün</span>` : ''}</button>`;
    }).join('') + (fresh ? `<div class="cat-new tiny muted">Yeni kategori: <b>${esc(normCat(raw))}</b> · alt kategori için <b>›</b> ya da <b>&gt;</b> yazın</div>` : '');
    box.classList.remove('hide');
  }
  input.addEventListener('focus', draw);
  input.addEventListener('input', (e) => { if (e.isTrusted !== false) draw(); });
  input.addEventListener('keydown', (e) => {
    if (box.classList.contains('hide')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; draw(); }
    else if (e.key === 'Enter' && sel >= 0 && items[sel]) { e.preventDefault(); pick(items[sel][0]); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('change', () => { const v = normCat(input.value); if (v !== input.value) input.value = v; });
  box.addEventListener('mousedown', (e) => { const b = e.target.closest('[data-i]'); if (b) { e.preventDefault(); pick(items[Number(b.dataset.i)][0]); } });
}
