// Ayarlar: firma bilgileri ve logo, stok senkronu ve stok sınırı, ana katalog, komisyon/kargo, kargo etiketi, kayıtlar.
// Kanal API bilgileri Entegrasyonlar'da, kullanıcılar Kullanıcılar sayfasındadır.
import { api, state, html, render, $, $$, dateTime, ch, chLogo, actions, busy, toast, numIn, confirmBox, isAdmin, activeChannels } from '../core.js';
import { loadSummary } from '../app.js';

// Logoyu en fazla 600×200 px PNG'ye küçült (veritabanında küçük yer kaplasın)
function shrink(file) {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); return; }
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 600 / img.width, 200 / img.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Görsel okunamadı'));
    img.src = URL.createObjectURL(file);
  });
}

export async function settingsView(el) {
  const admin = isAdmin();
  async function load() {
    const [chs, st, logs] = await Promise.all([api('channels'), api('settings'), api('logs')]);
    state.settings = st;
    const live = chs.filter((c) => !c.paused);
    const co = st.company || {};
    const dis = admin ? '' : 'disabled';
    render(el, html`<div class="stack" style="max-width:1000px">
      ${!admin ? html`<div class="notice"><i class="ico ico-warn"></i>Ayarları sadece yönetici değiştirebilir.</div>` : ''}
      <div class="card stack">
        <h2>Firma bilgileri</h2>
        <div class="row wrap" style="gap:16px;align-items:center">
          <div style="background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 14px"><img src="${st.logo || 'logo.webp'}" alt="Logo" style="height:56px;max-width:240px;object-fit:contain;display:block" data-logo-prev></div>
          <div class="row wrap">
            <label class="btn sm ${admin ? '' : 'hide'}"><i class="ico ico-upload"></i>Logo yükle<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-logo-file hidden></label>
            ${st.logo && admin ? html`<button class="btn sm ghost" data-act="logo-reset">Varsayılan logo</button>` : ''}
          </div>
        </div>
        <div class="form-grid">
          <label class="field"><span>Kısa ad (menüde)</span><input class="input" data-co="title" value="${co.title || ''}" ${dis}></label>
          <label class="field"><span>Firma unvanı</span><input class="input" data-co="legal" value="${co.legal || ''}" placeholder="ör. Hastürk Tarım Ürünleri Ltd. Şti." ${dis}></label>
          <label class="field"><span>Telefon</span><input class="input" data-co="phone" value="${co.phone || ''}" ${dis}></label>
          <label class="field"><span>E-posta</span><input class="input" data-co="email" value="${co.email || ''}" ${dis}></label>
          <label class="field"><span>Adres</span><input class="input" data-co="address" value="${co.address || ''}" ${dis}></label>
          <label class="field"><span>Vergi dairesi / no</span><input class="input" data-co="tax" value="${co.tax || ''}" ${dis}></label>
        </div>
      </div>

      <div class="card stack">
        <div class="card-head" style="margin:0"><h2>Stok</h2><button class="btn sm" data-act="push-stock"><i class="ico ico-upload"></i>Stokları şimdi gönder</button></div>
        <label class="row" style="align-items:flex-start;gap:12px"><span class="switch"><input type="checkbox" data-s="stock_sync" ${st.stock_sync ? 'checked' : ''} ${dis}><span></span></span>
          <span><b>Stokları tüm kanallarda senkron tut</b><br><span class="small muted">Bir kanalda satış olunca ortak stok düşer ve her kanala kendi kuralına göre (ortak / üst sınır / kanala özel adet) gönderilir. ${st.stock_sync && st.stock_since ? `Açıldığı an: ${dateTime(st.stock_since)} (öncesindeki siparişler stoğu etkilemez).` : 'Açmadan önce Eşleştirme sayfasını tamamlayın ve stok adetlerini kontrol edin.'}</span></span></label>
        <label class="row" style="align-items:flex-start;gap:12px"><span class="switch"><input type="checkbox" data-s="restock_returns" ${st.restock_returns ? 'checked' : ''} ${dis}><span></span></span>
          <span><b>İade gelen ürünü stoğa geri ekle</b><br><span class="small muted">İptal edilen siparişler her zaman stoğa geri eklenir.</span></span></label>
        <div class="form-grid">
          <label class="field"><span>Stok sınırı (bu adet ve altı “sınırın altında”)</span><input class="input" inputmode="numeric" data-low value="${st.low_stock}" ${dis}><small>Ürüne özel kritik stok girilmişse o kullanılır.</small></label>
        </div>
        <div><div class="small" style="font-weight:650;margin-bottom:6px">Stok gönderilecek kanallar</div><div class="row wrap">${live.map((c) => html`<label class="check"><input type="checkbox" data-stockch="${c.id}" ${(st.stock_channels || {})[c.id] === false ? '' : 'checked'} ${dis}> ${chLogo(c.id, true)}${c.name}</label>`)}</div></div>
        <div><div class="small" style="font-weight:650;margin-bottom:6px">Ana katalog (eşleşmeyen ürünleri otomatik oluşturan kanallar)</div><div class="row wrap">${live.filter((c) => c.type === 'ikas').map((c) => html`<label class="check"><input type="checkbox" data-catalog="${c.id}" ${(st.catalog_channels || []).includes(c.id) ? 'checked' : ''} ${dis}> ${chLogo(c.id, true)}${c.name}</label>`)}</div>
          <div class="muted tiny" style="margin-top:4px">Diğer kanallardaki ilanlar barkod / stok kodu kesin tutuyorsa otomatik bağlanır; tutmuyorsa Eşleştirme sayfasında onayınızı bekler.</div></div>
      </div>

      <div class="card flush"><div class="card-pad"><h2>Komisyon ve giderler</h2><div class="muted small" style="margin-top:4px">Sipariş ve istatistiklerdeki tahmini kâr bu değerlerle hesaplanır. Ürüne özel komisyon ürün formundan girilir.</div></div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Kanal</th><th class="r">Komisyon %</th><th class="r">Sipariş başı kargo ₺</th><th class="r">Hizmet bedeli ₺</th></tr></thead><tbody>
        ${live.map((c) => html`<tr><td><span class="ch-name">${chLogo(c.id, true)}${c.name}</span></td>
          ${['commission', 'shipping', 'service_fee'].map((k) => html`<td class="r"><input class="input" style="width:100px;text-align:right" inputmode="decimal" data-cost="${k}:${c.id}" value="${(st[k] || {})[c.id] ?? 0}" ${dis}></td>`)}</tr>`)}
      </tbody></table></div></div>

      <div class="card stack">
        <h2>Kargo etiketi</h2>
        <div class="form-grid">
          <label class="field"><span>Gönderen</span><input class="input" data-sender="name" value="${st.sender.name || co.title || ''}" ${dis}></label>
          <label class="field"><span>Telefon</span><input class="input" data-sender="phone" value="${st.sender.phone || ''}" ${dis}></label>
          <label class="field"><span>Adres</span><input class="input" data-sender="address" value="${st.sender.address || ''}" ${dis}></label>
          <label class="field"><span>İlçe / il</span><input class="input" data-sender="city" value="${st.sender.city || ''}" ${dis}></label>
          <label class="field"><span>Kargo firmaları (virgülle)</span><input class="input" data-cargos value="${(st.cargo_companies || []).join(', ')}" ${dis}></label>
          <label class="field"><span>İlk senkronda geçmiş (gün)</span><input class="input" inputmode="numeric" data-history value="${st.history_days}" ${dis}></label>
        </div>
        <label class="row" style="align-items:flex-start;gap:12px"><span class="switch"><input type="checkbox" data-s="zpl_pdf" ${st.zpl_pdf ? 'checked' : ''} ${dis}><span></span></span>
          <span><b>ZPL etiketini PDF'e çevir</b><br><span class="small muted">Trendyol ve Hepsiburada etiketi termal yazıcı biçiminde (ZPL) gelir; normal yazıcı için PDF'e çevrilir. Çeviri Labelary servisiyle yapılır ve etiket içeriği (alıcı adı/adresi) bu servise gönderilir.</span></span></label>
      </div>
      ${admin ? html`<div class="row wrap"><button class="btn ghost danger" data-act="purge">Örnek (demo) verileri temizle</button><span class="spacer"></span><button class="btn primary lg" data-act="save">Ayarları kaydet</button></div>` : ''}

      <div class="card flush"><div class="card-pad row"><h2 style="flex:1">İşlem kayıtları</h2><a class="btn sm ghost" href="#/bildirimler">Bildirimler</a></div>
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
      if (e.target.dataset.catalog) { await save({ catalog_channels: $$('[data-catalog]', el).filter((x) => x.checked).map((x) => x.dataset.catalog) }); toast('Kaydedildi'); }
      if (e.target.matches('[data-logo-file]') && e.target.files[0]) {
        const data = await shrink(e.target.files[0]);
        await save({ logo: data });
        $('[data-logo-prev]', el).src = data;
        await loadSummary(); toast('Logo güncellendi');
      }
    } catch (err) { toast(err.message, true); }
  });
  actions(el, {
    'push-stock': (t) => busy(t, async () => { const r = await api('push-stock', { method: 'POST' }); toast(r.skipped || Object.entries(r).map(([k, v]) => `${ch(k).name}: ${v}`).join(' · ') || 'Gönderilecek değişiklik yok'); }),
    'logo-reset': (t) => busy(t, async () => { await save({ logo: '' }); await loadSummary(); load(); }),
    purge: async (t) => {
      if (!(await confirmBox('Deneme modunda oluşan örnek siparişler, ilanlar ve ürünler silinsin mi? Gerçek kanal verisine dokunulmaz.', 'Temizle'))) return;
      busy(t, async () => { const r = await api('purge-demo', { method: 'POST' }); toast(`${r.orders} örnek sipariş ve ${r.products} örnek ürün silindi`); await loadSummary(); });
    },
    save: (t) => busy(t, async () => {
      const cost = { commission: {}, shipping: {}, service_fee: {} };
      $$('[data-cost]', el).forEach((i) => { const [k, c] = i.dataset.cost.split(':'); cost[k][c] = numIn(i.value); });
      const sender = {}; $$('[data-sender]', el).forEach((i) => { sender[i.dataset.sender] = i.value.trim(); });
      const company = {}; $$('[data-co]', el).forEach((i) => { company[i.dataset.co] = i.value.trim(); });
      await save({ ...cost, sender, company, low_stock: numIn($('[data-low]', el).value), cargo_companies: $('[data-cargos]', el).value.split(',').map((x) => x.trim()).filter(Boolean), history_days: numIn($('[data-history]', el).value) });
      await loadSummary();
      toast('Ayarlar kaydedildi');
    }),
  });
  await load();
  return { refresh: load };
}
