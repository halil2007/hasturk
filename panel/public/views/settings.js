// Ayarlar: stok senkronu, komisyon/kargo varsayılanları, gönderici (etiket), etiket biçimi, kayıtlar.
// Kanal API bilgileri Entegrasyonlar sayfasındadır.
import { api, state, html, render, $, $$, dateTime, ch, chLogo, actions, busy, toast, numIn } from '../core.js';

export async function settingsView(el) {
  async function load() {
    const [chs, st, logs] = await Promise.all([api('channels'), api('settings'), api('logs')]);
    state.channels = chs; state.settings = st;
    render(el, html`<div class="stack" style="max-width:980px">
      <div class="card stack">
        <div class="card-head" style="margin:0"><h2>Stok senkronu</h2><button class="btn sm" data-act="push-stock"><i class="ico ico-upload"></i>Stokları şimdi gönder</button></div>
        <label class="row" style="align-items:flex-start;gap:12px"><span class="switch"><input type="checkbox" data-s="stock_sync" ${st.stock_sync ? 'checked' : ''}><span></span></span>
          <span><b>Stokları tüm kanallarda senkron tut</b><br><span class="small muted">Herhangi bir kanalda satış olunca ortak stok düşer ve yeni adet diğer tüm kanallara gönderilir. Stok girişi yaptığınızda da tüm kanallar güncellenir. ${st.stock_sync && st.stock_since ? `Açıldığı an: ${dateTime(st.stock_since)} (öncesindeki siparişler stoğu etkilemez).` : 'Açmadan önce Ürünler → içe aktarma ve eşleştirme adımlarını tamamlayıp stok adetlerini kontrol edin.'}</span></span></label>
        <label class="row" style="align-items:flex-start;gap:12px"><span class="switch"><input type="checkbox" data-s="restock_returns" ${st.restock_returns ? 'checked' : ''}><span></span></span>
          <span><b>İade gelen ürünü stoğa geri ekle</b><br><span class="small muted">Kapalıysa iadeleri kontrol edip stok girişini elle yaparsınız. İptal edilen siparişler her zaman stoğa geri eklenir.</span></span></label>
        <div><div class="small" style="font-weight:650;margin-bottom:6px">Stok gönderilecek kanallar</div><div class="row wrap">${chs.map((c) => html`<label class="check"><input type="checkbox" data-stockch="${c.id}" ${(st.stock_channels || {})[c.id] === false ? '' : 'checked'}> ${chLogo(c.id, true)}${c.name}</label>`)}</div></div>
      </div>

      <div class="card flush"><div class="card-pad"><h2>Komisyon ve giderler</h2><div class="muted small" style="margin-top:4px">Sipariş ve istatistiklerdeki tahmini kâr bu değerlerle hesaplanır. Ürüne özel komisyon ürün formundan girilir.</div></div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Kanal</th><th class="r">Komisyon %</th><th class="r">Sipariş başı kargo ₺</th><th class="r">Hizmet bedeli ₺</th></tr></thead><tbody>
        ${chs.map((c) => html`<tr><td>${html`<span class="ch-name">${chLogo(c.id, true)}${c.name}</span>`}</td>
          ${['commission', 'shipping', 'service_fee'].map((k) => html`<td class="r"><input class="input" style="width:100px;text-align:right" inputmode="decimal" data-cost="${k}:${c.id}" value="${(st[k] || {})[c.id] ?? 0}"></td>`)}</tr>`)}
      </tbody></table></div></div>

      <div class="card stack">
        <h2>Kargo etiketi</h2>
        <div class="form-grid">
          <label class="field"><span>Gönderen firma / ad</span><input class="input" data-sender="name" value="${st.sender.name || ''}"></label>
          <label class="field"><span>Telefon</span><input class="input" data-sender="phone" value="${st.sender.phone || ''}"></label>
          <label class="field"><span>Adres</span><input class="input" data-sender="address" value="${st.sender.address || ''}"></label>
          <label class="field"><span>İlçe / il</span><input class="input" data-sender="city" value="${st.sender.city || ''}"></label>
          <label class="field"><span>Kargo firmaları (virgülle)</span><input class="input" data-cargos value="${(st.cargo_companies || []).join(', ')}"></label>
          <label class="field"><span>İlk senkronda geçmiş (gün)</span><input class="input" inputmode="numeric" data-history value="${st.history_days}"></label>
        </div>
        <label class="row" style="align-items:flex-start;gap:12px"><span class="switch"><input type="checkbox" data-s="zpl_pdf" ${st.zpl_pdf ? 'checked' : ''}><span></span></span>
          <span><b>ZPL etiketini PDF'e çevir</b><br><span class="small muted">Trendyol ve Hepsiburada etiketi termal yazıcı biçiminde (ZPL) gelir. Normal yazıcıda basmak için PDF'e çevrilir. Çeviri <b>Labelary</b> servisiyle yapılır; etiket içeriği (alıcı adı/adresi) bu servise gönderilir. Termal yazıcınız varsa kapalı bırakın.</span></span></label>
        <div class="row"><span class="spacer"></span><button class="btn primary" data-act="save">Ayarları kaydet</button></div>
      </div>

      <div class="card flush"><div class="card-pad row"><h2 style="flex:1">Kayıtlar</h2><a class="btn sm ghost" href="#/entegrasyonlar">Entegrasyonlar</a></div>
        <div class="table-wrap" style="max-height:380px;overflow:auto"><table class="t"><tbody>
        ${logs.length ? logs.map((l) => html`<tr><td class="small muted" style="white-space:nowrap">${dateTime(l.at)}</td><td class="small">${l.channel ? ch(l.channel).name : ''}</td><td class="small" style="color:${l.level === 'error' ? 'var(--bad)' : l.level === 'warn' ? 'var(--amber)' : 'inherit'}">${l.msg}</td></tr>`) : html`<tr><td class="empty">Kayıt yok</td></tr>`}
      </tbody></table></div></div>
    </div>`);
  }
  const save = async (patch) => { state.settings = await api('settings', { method: 'PUT', body: patch }); };
  el.addEventListener('change', async (e) => {
    const k = e.target.dataset.s;
    try {
      if (k) { await save({ [k]: e.target.checked }); toast('Kaydedildi'); if (k === 'stock_sync') load(); }
      if (e.target.dataset.stockch) {
        const m = {}; $$('[data-stockch]', el).forEach((x) => { m[x.dataset.stockch] = x.checked; });
        await save({ stock_channels: m }); toast('Kaydedildi');
      }
    } catch (err) { toast(err.message, true); }
  });
  actions(el, {
    'push-stock': (t) => busy(t, async () => { const r = await api('push-stock', { method: 'POST' }); toast(r.skipped || Object.entries(r).map(([k, v]) => `${ch(k).name}: ${v}`).join(' · ') || 'Gönderilecek değişiklik yok'); }),
    save: (t) => busy(t, async () => {
      const cost = { commission: {}, shipping: {}, service_fee: {} };
      $$('[data-cost]', el).forEach((i) => { const [k, c] = i.dataset.cost.split(':'); cost[k][c] = numIn(i.value); });
      const sender = {}; $$('[data-sender]', el).forEach((i) => { sender[i.dataset.sender] = i.value.trim(); });
      await save({ ...cost, sender, cargo_companies: $('[data-cargos]', el).value.split(',').map((x) => x.trim()).filter(Boolean), history_days: numIn($('[data-history]', el).value) });
      toast('Ayarlar kaydedildi');
    }),
  });
  await load();
  return { refresh: load };
}
