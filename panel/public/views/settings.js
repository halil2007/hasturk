// Ayarlar: kanal bağlantıları, stok senkronu, komisyon/kargo varsayılanları, gönderici bilgisi, kayıtlar.
import { api, state, html, render, $, $$, ago, dateTime, ch, chColor, actions, busy, toast, numIn } from '../core.js';

export async function settingsView(el) {
  async function load() {
    const [chs, st, logs] = await Promise.all([api('channels'), api('settings'), api('logs')]);
    state.channels = chs; state.settings = st;
    render(el, html`<div class="stack" style="max-width:900px">
      <div class="section-title" style="margin-top:0"><h2>Satış kanalları</h2><button class="btn sm" data-act="sync-all"><i class="ico ico-sync"></i>Hepsini senkronla</button></div>
      <div class="list">${chs.map((c) => html`<div class="card" style="border-left:4px solid ${chColor(c.id)}">
        <div class="row wrap"><b style="flex:1">${c.name}</b>
          ${!c.enabled ? html`<span class="pill">Bağlı değil</span>` : c.demo ? html`<span class="pill warn">Deneme verisi</span>` : c.last && !c.last.ok ? html`<span class="pill bad">Hata</span>` : html`<span class="pill good">Bağlı</span>`}
          ${c.beta ? html`<span class="pill warn" title="Canlı hesapla doğrulanması gerekiyor">Beta</span>` : ''}
          ${c.enabled ? html`<button class="btn sm" data-act="sync-one" data-id="${c.id}">Senkronla</button>` : ''}</div>
        <div class="small muted" style="margin-top:6px">${c.last ? html`Son senkron ${ago(c.last.at)}${c.last.ok ? ` · ${c.last.count} sipariş kontrol edildi` : ''}` : 'Henüz senkron yapılmadı'} · ${c.listings} ilan (${c.linked} eşleşmiş)${c.listingErrors ? html` · <span style="color:var(--bad)">${c.listingErrors} ilanda hata</span>` : ''}</div>
        ${c.last && !c.last.ok ? html`<div class="notice bad small" style="margin-top:8px">${c.last.error}</div>` : ''}
        ${c.missing && c.missing.length && !c.demo ? html`<div class="small" style="margin-top:8px">Bağlamak için Cloudflare'de şu gizli değişkenleri tanımlayın: ${c.missing.map((m) => html`<code style="background:var(--surface-2);padding:1px 6px;border-radius:4px;margin:2px;display:inline-block">${m}</code>`)}</div>` : ''}
        <div class="tiny muted" style="margin-top:6px">Kanalda: ${[c.caps.accept === 'remote' ? 'işleme alma' : '', c.caps.split === 'remote' || c.caps.split === 'remote-async' ? 'paket bölme' : '', c.caps.ship === 'remote' ? 'kargo bildirimi' : '', c.caps.label ? 'resmi kargo etiketi' : '', 'stok', c.caps.price ? 'fiyat' : '', c.caps.createProduct ? 'ürün oluşturma' : ''].filter(Boolean).join(' · ')}. Diğer işlemler panelde kaydedilir.</div>
      </div>`)}</div>

      <div class="section-title"><h2>Stok senkronu</h2></div>
      <div class="card stack">
        <label class="row" style="align-items:flex-start;gap:12px"><span class="switch"><input type="checkbox" data-s="stock_sync" ${st.stock_sync ? 'checked' : ''}><span></span></span>
          <span><b>Stokları tüm kanallarda senkron tut</b><br><span class="small muted">Herhangi bir kanalda satış olunca paneldeki stok düşer ve yeni adet diğer tüm kanallara gönderilir. Stok girişi yaptığınızda da tüm kanallar güncellenir. ${st.stock_sync && st.stock_since ? `Açıldığı an: ${dateTime(st.stock_since)} (öncesindeki siparişler stoğu etkilemez).` : 'Açmadan önce Ürünler → İçe aktar / Eşleştir adımlarını tamamlayın ve stok adetlerini kontrol edin.'}</span></span></label>
        <label class="row" style="align-items:flex-start;gap:12px"><span class="switch"><input type="checkbox" data-s="restock_returns" ${st.restock_returns ? 'checked' : ''}><span></span></span>
          <span><b>İade gelen ürünü stoğa geri ekle</b><br><span class="small muted">Kapalıysa iadeleri kontrol edip stok girişini elle yaparsınız. İptal edilen siparişler her zaman stoğa geri eklenir.</span></span></label>
        <div><div class="small" style="font-weight:600;margin-bottom:6px">Stok gönderilecek kanallar</div><div class="row wrap">${chs.map((c) => html`<label class="check"><input type="checkbox" data-stockch="${c.id}" ${(st.stock_channels || {})[c.id] === false ? '' : 'checked'}> ${c.name}</label>`)}</div></div>
        <div><button class="btn sm" data-act="push-stock">Stokları şimdi gönder</button></div>
      </div>

      <div class="section-title"><h2>Komisyon ve giderler</h2></div>
      <div class="card flush"><div class="table-wrap"><table class="t"><thead><tr><th>Kanal</th><th class="r">Komisyon %</th><th class="r">Sipariş başı kargo ₺</th><th class="r">Hizmet bedeli ₺</th></tr></thead><tbody>
        ${chs.map((c) => html`<tr><td><span class="ch-badge"><span class="dot" style="background:${chColor(c.id)}"></span>${c.name}</span></td>
          ${['commission', 'shipping', 'service_fee'].map((k) => html`<td class="r"><input class="input qty-in" style="width:90px" inputmode="decimal" data-cost="${k}:${c.id}" value="${(st[k] || {})[c.id] ?? 0}"></td>`)}</tr>`)}
      </tbody></table></div><div style="padding:12px 16px" class="muted small">Sipariş ve istatistiklerdeki tahmini kâr bu değerlerle hesaplanır. Ürüne özel komisyon, ürün formundaki kanal ilanlarından girilir.</div></div>

      <div class="section-title"><h2>Gönderici (kargo etiketi)</h2></div>
      <div class="card form-grid">
        <label class="field"><span>Firma / ad</span><input class="input" data-sender="name" value="${st.sender.name || ''}"></label>
        <label class="field"><span>Telefon</span><input class="input" data-sender="phone" value="${st.sender.phone || ''}"></label>
        <label class="field"><span>Adres</span><input class="input" data-sender="address" value="${st.sender.address || ''}"></label>
        <label class="field"><span>İlçe / il</span><input class="input" data-sender="city" value="${st.sender.city || ''}"></label>
        <label class="field"><span>Kargo firmaları (virgülle)</span><input class="input" data-cargos value="${(st.cargo_companies || []).join(', ')}"></label>
        <label class="field"><span>İlk senkronda geçmiş (gün)</span><input class="input" inputmode="numeric" data-history value="${st.history_days}"></label>
      </div>
      <div class="row"><span class="spacer"></span><button class="btn primary" data-act="save">Ayarları kaydet</button></div>

      <div class="section-title"><h2>Kayıtlar</h2><button class="btn sm ghost" data-act="logout">Çıkış yap</button></div>
      <div class="card flush"><div class="table-wrap" style="max-height:360px;overflow:auto"><table class="t"><tbody>
        ${logs.length ? logs.map((l) => html`<tr><td class="small muted" style="white-space:nowrap">${dateTime(l.at)}</td><td class="small">${l.channel ? ch(l.channel).name : ''}</td><td class="small" style="color:${l.level === 'error' ? 'var(--bad)' : l.level === 'warn' ? 'var(--warn)' : 'inherit'}">${l.msg}</td></tr>`) : html`<tr><td class="empty">Kayıt yok</td></tr>`}
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
    'sync-all': (t) => busy(t, async () => { const r = await api('sync', { method: 'POST', body: { force: true } }); toast(r.skipped || 'Senkron tamamlandı'); load(); }),
    'sync-one': (t) => busy(t, async () => { const r = await api('sync', { method: 'POST', body: { channels: [t.dataset.id], force: true } }); const v = (r.channels || {})[t.dataset.id]; toast(typeof v === 'string' ? v : `${v ?? 0} sipariş kontrol edildi`, typeof v === 'string'); load(); }),
    'push-stock': (t) => busy(t, async () => { const r = await api('push-stock', { method: 'POST' }); toast(r.skipped || Object.entries(r).map(([k, v]) => `${ch(k).name}: ${v}`).join(' · ') || 'Gönderilecek değişiklik yok'); }),
    save: (t) => busy(t, async () => {
      const cost = { commission: {}, shipping: {}, service_fee: {} };
      $$('[data-cost]', el).forEach((i) => { const [k, c] = i.dataset.cost.split(':'); cost[k][c] = numIn(i.value); });
      const sender = {}; $$('[data-sender]', el).forEach((i) => { sender[i.dataset.sender] = i.value.trim(); });
      await save({ ...cost, sender, cargo_companies: $('[data-cargos]', el).value.split(',').map((x) => x.trim()).filter(Boolean), history_days: numIn($('[data-history]', el).value) });
      toast('Ayarlar kaydedildi');
    }),
    logout: async () => { await api('logout', { method: 'POST' }).catch(() => {}); location.reload(); },
  });
  await load();
  return { refresh: load };
}
