// Hızlı alış fiyatı: raporlardaki "alış fiyatı yok" uyarılarına basınca küçük pencere açılır, fiyat girilip kaydedilir.
// Kullanım: costBtn(ürünId, ad) düğmesi; tıklama tüm sayfalarda burada yakalanır (app.js içe aktarır). Kayıttan sonra sayfa yenilenir.
import { api, html, raw, $, sheet, toast, busy } from './core.js';

export const costBtn = (pid, name, label = 'alış fiyatı yok · gir') => (pid ? html`<button type="button" class="pill warn tiny cost-btn" data-cost="${pid}" data-cost-name="${name || ''}" title="Alış fiyatını girmek için tıklayın">${label}</button>` : html`<span class="pill warn tiny">alış fiyatı yok</span>`);

export function editCost(pid, name, onDone) {
  const s = sheet({
    title: 'Alış fiyatı', size: 'narrow',
    body: html`<div class="stack"><div class="muted small">${name || 'Ürün'}</div>
      <label class="field"><span>Birim alış fiyatı (KDV dahil)</span><div class="input-group"><input class="input" inputmode="decimal" data-cost-in placeholder="0,00"><span class="suffix">₺</span></div></label>
      <div class="muted tiny">Ürünü size maliyeti (tedarikçi faturası, KDV dahil). Kâr hesapları bu fiyatla yeniden yapılır.</div></div>`,
    foot: html`<span class="spacer"></span><button class="btn" data-close>Vazgeç</button><button class="btn primary" data-cost-save>Kaydet</button>`,
  });
  const inp = $('[data-cost-in]', s.el), btn = $('[data-cost-save]', s.el);
  const save = () => busy(btn, async () => {
    const v = Number(String(inp.value).trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    if (!(v > 0)) { toast('Geçerli bir alış fiyatı girin', true); inp.focus(); return; }
    await api(`products/${pid}/cost`, { method: 'POST', body: { purchase_price: v } });
    s.close(); toast('Alış fiyatı kaydedildi'); onDone && onDone(v);
  });
  btn.onclick = save;
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  setTimeout(() => inp.focus(), 50);
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-cost]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    editCost(Number(b.dataset.cost), b.dataset.costName, () => window.dispatchEvent(new HashChangeEvent('hashchange')));
  }, true);
}
void raw;
