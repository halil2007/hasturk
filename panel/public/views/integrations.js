// Entegrasyonlar: pazaryeri ve site API bilgileri panelden girilir/değiştirilir (sunucuda şifreli saklanır),
// bağlantı test edilir, kanal aktif/pasif yapılır, senkron ve ürün içe aktarma buradan başlatılır.
import { api, state, html, render, $, $$, ago, ch, chLogo, chState, actions, busy, toast, confirmBox } from '../core.js';
import { loadSummary } from '../app.js';
import { importDialog } from './products.js';

const HELP = {
  ikas: 'ikas paneli → Uygulamalar → Özel uygulama oluştur. İzinler: Ürünler, Siparişler, Stok (okuma + yazma).',
  trendyol: 'Trendyol satıcı paneli → Hesap Bilgilerim → Entegrasyon Bilgileri.',
  hepsiburada: 'Hepsiburada merchant paneli → Entegrasyon / API bilgileri (Merchant ID ve servis anahtarı).',
  pttavm: 'PttAVM mağaza paneli → Entegrasyon → API kullanıcısı. Kargo barkodu için depo numarası gerekir.',
};

export async function integrations(el) {
  let data = null;
  async function load() {
    data = await api('integrations');
    draw();
  }
  function field(c, f) {
    const src = f.source === 'panel' ? html`<span class="src panel">panelde</span>` : f.source === 'cloudflare' ? html`<span class="src" title="Cloudflare gizli değişkeninden">Cloudflare</span>` : '';
    return html`<label class="field"><span class="row" style="gap:6px">${f.label}${f.req ? html`<b style="color:var(--bad)">*</b>` : ''}${src}</span>
      ${f.secret
        ? html`<input class="input" type="password" autocomplete="new-password" data-k="${f.k}" placeholder="${f.masked ? `${f.masked} (kayıtlı — değiştirmek için yazın)` : 'gizli değer'}">`
        : html`<input class="input" data-k="${f.k}" value="${f.value}" placeholder="${f.hint || ''}" autocomplete="off">`}
      ${f.hint && (f.secret || f.value) ? html`<small>${f.hint}</small>` : ''}
      ${f.secret && f.source === 'panel' ? html`<small><a href="#" class="link" data-act="clear" data-id="${c.id}" data-k="${f.k}">Panelde kayıtlı değeri sil</a></small>` : ''}</label>`;
  }
  function card(c) {
    const [k, t] = chState(c);
    const basic = c.fields.filter((f) => !f.adv), adv = c.fields.filter((f) => f.adv);
    return html`<div class="card" data-ch="${c.id}">
      <div class="hd">${chLogo(c.id)}<div style="flex:1;min-width:0"><h2 class="ellipsis">${c.type === 'ikas' ? `ikas · ${c.name}` : c.name}</h2>
        <div class="row small"><span class="led ${k === 'off' ? 'off' : k === 'err' ? 'err' : k === 'demo' ? 'demo' : ''}"></span>${t}${c.last ? html`<span class="muted">· son eşitleme ${ago(c.last.at)}</span>` : ''}${c.beta ? html`<span class="pill amber" title="Canlı hesapla doğrulanması gerekiyor">Beta</span>` : ''}</div></div>
        <label class="row small" title="Pasif kanal senkronlanmaz">Aktif <span class="switch"><input type="checkbox" data-active="${c.id}" ${c.active ? 'checked' : ''}><span></span></span></label></div>
      ${c.locked ? html`<div class="notice bad small"><i class="ico ico-warn"></i>Kayıtlı bilgiler okunamadı (panel şifresi / PANEL_SECRET değişmiş olabilir). Bilgileri yeniden girin.</div>` : ''}
      ${c.last && !c.last.ok ? html`<div class="notice bad small"><i class="ico ico-warn"></i><div>${c.last.error}</div></div>` : ''}
      <div class="muted small">${HELP[c.type]}</div>
      <div class="form-grid">${basic.map((f) => field(c, f))}</div>
      ${adv.length ? html`<details class="adv"><summary>Gelişmiş ayarlar (${adv.length})</summary><div class="form-grid" style="margin-top:10px">${adv.map((f) => field(c, f))}</div></details>` : ''}
      <div class="small muted">${c.listings} ilan · ${c.linked} eşleşmiş${c.listingErrors ? html` · <span style="color:var(--bad)">${c.listingErrors} hatalı</span>` : ''} · Kanalda: ${[c.caps.accept === 'remote' ? 'işleme alma' : '', c.caps.split && c.caps.split !== 'local' ? 'paket bölme' : '', c.caps.ship === 'remote' ? 'kargo bildirimi' : '', c.caps.label ? 'kargo etiketi' : 'kargo barkodu', 'stok', c.caps.price ? 'fiyat' : '', c.caps.createProduct ? 'ürün oluşturma' : ''].filter(Boolean).join(', ')}</div>
      <div class="row wrap" style="margin-top:auto">
        <button class="btn primary" data-act="save" data-id="${c.id}">Kaydet</button>
        <button class="btn outline" data-act="test" data-id="${c.id}"><i class="ico ico-key"></i>Bağlantıyı test et</button>
        <span class="spacer"></span>
        <button class="btn sm ghost" data-act="sync" data-id="${c.id}" ${c.enabled ? '' : 'disabled'}><i class="ico ico-sync"></i>Senkronla</button>
        <button class="btn sm ghost" data-act="import" data-id="${c.id}" ${c.enabled ? '' : 'disabled'}><i class="ico ico-download"></i>İlanları çek</button>
      </div>
      <div class="small" data-res></div>
    </div>`;
  }
  function draw() {
    render(el, html`<div class="stack">
      <div class="notice"><i class="ico ico-key"></i><div>API bilgileri sunucuda <b>şifreli</b> saklanır ve bir daha ekranda açık gösterilmez (gizli alanlar boş bırakılırsa eski değer korunur). Panelde girilen değer, Cloudflare'de tanımlı aynı bilginin önüne geçer.
        ${data.secretSet ? '' : html`<br><b>Öneri:</b> Cloudflare'de <code>PANEL_SECRET</code> (uzun rastgele metin) tanımlayın; yoksa şifreleme panel şifresine bağlıdır ve şifre değişirse API bilgilerini yeniden girmeniz gerekir.`}</div></div>
      <div class="integ">${data.channels.map(card)}</div>
    </div>`);
  }
  const values = (id) => { const o = {}; $$(`[data-ch="${id}"] [data-k]`, el).forEach((i) => { o[i.dataset.k] = i.value; }); return o; };
  const after = async () => { await loadSummary().catch(() => {}); await load(); };
  actions(el, {
    save: (t) => busy(t, async () => { await api('integrations/' + t.dataset.id, { method: 'PUT', body: { values: values(t.dataset.id) } }); toast('Kaydedildi'); await after(); }),
    test: (t) => busy(t, async () => {
      const id = t.dataset.id;
      await api('integrations/' + id, { method: 'PUT', body: { values: values(id) } });
      const r = await api(`integrations/${id}/test`, { method: 'POST' });
      await after();
      const box = $(`[data-ch="${id}"] [data-res]`, el);
      render(box, html`<div class="notice ${r.ok ? 'good' : 'bad'}"><i class="ico ico-${r.ok ? 'check' : 'warn'}"></i><div>${r.message}</div></div>`);
    }),
    sync: (t) => busy(t, async () => { const r = await api('sync', { method: 'POST', body: { channels: [t.dataset.id], force: true } }); const v = (r.channels || {})[t.dataset.id]; toast(typeof v === 'string' ? v : `${v ?? 0} sipariş kontrol edildi`, typeof v === 'string'); await after(); }),
    import: () => importDialog(after),
    clear: async (t) => {
      if (!(await confirmBox('Panelde kayıtlı bu gizli değer silinsin mi? (Cloudflare\'de tanımlıysa o kullanılır.)', 'Sil'))) return;
      await api('integrations/' + t.dataset.id, { method: 'PUT', body: { clear: [t.dataset.k] } }); toast('Silindi'); await after();
    },
  });
  el.addEventListener('change', async (e) => {
    const id = e.target.dataset.active;
    if (!id) return;
    try { await api('integrations/' + id, { method: 'PUT', body: { active: e.target.checked } }); toast(e.target.checked ? `${ch(id).name} aktif` : `${ch(id).name} pasif: senkronlanmaz`); await after(); } catch (err) { toast(err.message, true); }
  });
  await load().catch((e) => render(el, html`<div class="notice bad">${e.message}</div>`));
  return { refresh: load };
}
