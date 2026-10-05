// Entegrasyonlar: pazaryeri ve site API bilgileri panelden girilir/değiştirilir (sunucuda şifreli saklanır),
// bağlantı test edilir, kanal aktif/pasif yapılır; son başarılı senkron zamanları, hatalar ve geçmiş sipariş aktarımı buradadır.
import { api, state, html, render, $, $$, n, ago, date, dateTime, ch, chLogo, chState, actions, busy, toast, confirmBox, dayKey } from '../core.js';
import { loadSummary } from '../app.js';
import { importDialog } from './products.js';
import { diagnoseDialog, systemCheck } from './diagnose.js';

const HELP = {
  ikas: 'ikas paneli → Uygulamalar → Özel uygulama oluştur. İzinler: Ürünler, Siparişler, Stok, Mağaza bilgisi (okuma + yazma). Görseller ve varyantlar ürünlerle birlikte gelir.',
  trendyol: 'Trendyol satıcı paneli → Hesap Bilgilerim → Entegrasyon Bilgileri.',
  hepsiburada: 'Hepsiburada Merchant Portal → Hesabım → Entegrasyon: Merchant ID, servis anahtarı ve entegratör adı (User-Agent olarak gönderilir; girilmezse Hepsiburada istekleri reddeder).',
  pttavm: 'PttAVM mağaza paneli → Entegrasyon → API kullanıcısı. Kargo barkodu için depo numarası gerekir.',
  n11: 'N11 Satıcı Ofisi (so.n11.com) → Hesabım → API Hesapları → Yeni Hesap Oluştur; App Key ve App Secret e-postayla gelir.',
  idefix: 'idefix satıcı paneli → Hesap Bilgileri → Entegrasyon Bilgileri → Yeni API Oluştur (API Key, API Secret) ve Vendor ID.',
  pazarama: 'Pazarama iş ortağı paneli → Hesabım → Hesap Bilgileri → Entegrasyon Bilgileri (API Key = Client ID, API Secret).',
};

// Sıra: kanal türü (ikas, Hepsiburada, Trendyol, ...), aynı türde önce ana mağaza sonra eklenenler
const TYPES = ['ikas', 'hepsiburada', 'trendyol', 'pttavm', 'n11', 'idefix', 'pazarama'];
// Yakında eklenecek satış kanalları (seçilemez, yalnız bilgi)
const SOON = ['Amazon', 'Çiçeksepeti', 'Koçtaş', 'Teknosa', 'Turkcell Pasaj', 'Shopify', 'WooCommerce', 'Etsy'];
const TYPE_NAME = { ikas: 'ikas (web sitesi)', hepsiburada: 'Hepsiburada', trendyol: 'Trendyol', pttavm: 'PttAVM', n11: 'N11', idefix: 'idefix', pazarama: 'Pazarama' };
const rank = (c) => TYPES.indexOf(c.type) * 1000 + (c.extra ? Number(c.id.split('_')[1]) || 99 : c.id === 'ikas2' ? 2 : 1);
const when = (ms) => (ms ? html`<span title="${dateTime(ms)}">${ago(ms)}</span>` : html`<span class="muted">henüz yok</span>`);

export async function integrations(el) {
  let data = null, jobs = [];
  async function load() {
    [data, jobs] = await Promise.all([api('integrations'), api('backfill').catch(() => [])]);
    data.channels.sort((a, b) => rank(a) - rank(b));
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
        <div class="row small"><span class="led ${k === 'off' ? 'off' : k === 'err' ? 'err' : k === 'demo' ? 'demo' : ''}"></span>${t}</div></div>
        <label class="row small" title="Pasif kanal senkronlanmaz">Aktif <span class="switch"><input type="checkbox" data-active="${c.id}" ${c.active ? 'checked' : ''}><span></span></span></label></div>
      ${!c.gated ? html`<label class="row small" style="gap:10px;align-items:flex-start"><span class="switch"><input type="checkbox" data-hold="${c.id}" ${((state.settings && state.settings.hold_channels) || []).includes(c.id) ? 'checked' : ''}><span></span></span>
        <span><b>Kanala yazmayı beklet</b> <span class="muted">— siparişler, ürünler, stok ve kanalda oluşan etiketler okunur; paketleme, kargo bildirimi, stok/fiyat gönderimi ve ürün oluşturma ${c.type === 'ikas' ? 'ikas' : 'kanal'} panelinden yapılır.</span></span></label>` : ''}
      ${c.locked ? html`<div class="notice bad small"><i class="ico ico-warn"></i>Kayıtlı bilgiler okunamadı (panel şifresi / PANEL_SECRET değişmiş olabilir). Bilgileri yeniden girin.</div>` : ''}
      ${c.enabled ? html`<div class="sync-grid">
        <div><span class="muted tiny">Siparişler · son başarılı</span><b>${when(c.last && c.last.ordersAt)}</b></div>
        <div><span class="muted tiny">Ürün / stok · son başarılı</span><b>${when(c.last && c.last.listingsAt)}</b></div>
        <div><span class="muted tiny">İlan · eşleşmiş</span><b>${n(c.listings)} · ${n(c.linked)}</b></div></div>` : ''}
      ${c.last && c.last.note && !c.last.error ? html`<div class="notice small"><i class="ico ico-check"></i><div>${c.last.note}${c.last.noteAt ? ` · ${dateTime(c.last.noteAt)}` : ''}</div></div>` : ''}
      ${c.last && c.last.ok === false ? html`<div class="notice bad small"><i class="ico ico-warn"></i><div><b>Sipariş senkronu başarısız${c.last.fails > 1 ? ` (${c.last.fails}. deneme)` : ''}:</b> ${c.last.error || 'ayrıntı yok — Tanılama ile kontrol edin'}<div class="tiny muted">${c.last.nextTry ? `Art arda hata: sonraki otomatik deneme ${dateTime(c.last.nextTry)} (Senkronla hemen dener).` : '15 dakikada bir otomatik yeniden denenir.'}</div></div></div>` : ''}
      ${c.last && c.last.listingsError ? html`<div class="notice bad small"><i class="ico ico-warn"></i><div><b>Ürün/stok alınamadı:</b> ${c.last.listingsError}</div></div>` : ''}
      <div class="muted small">${HELP[c.type]}</div>
      <div class="form-grid">${basic.map((f) => field(c, f))}</div>
      ${adv.length ? html`<details class="adv"><summary>Gelişmiş ayarlar (${adv.length})</summary><div class="form-grid" style="margin-top:10px">${adv.map((f) => field(c, f))}</div></details>` : ''}
      <div class="small muted">${c.listings} ilan · ${c.linked} eşleşmiş${c.listingErrors ? html` · <span style="color:var(--bad)">${c.listingErrors} hatalı</span>` : ''} · Kanalda: ${[c.caps.accept === 'remote' ? 'işleme alma' : '', c.caps.split && c.caps.split !== 'local' ? 'paket bölme' : '', c.caps.ship === 'remote' ? 'kargo bildirimi' : '', c.caps.label ? 'kargo etiketi' : 'kargo barkodu', 'stok', c.caps.price ? 'fiyat' : '', c.caps.createProduct ? 'ürün oluşturma' : ''].filter(Boolean).join(', ')}</div>
      <div class="row wrap" style="margin-top:auto">
        <button class="btn primary" data-act="save" data-id="${c.id}">Kaydet</button>
        <button class="btn outline" data-act="test" data-id="${c.id}"><i class="ico ico-key"></i>Bağlantıyı test et</button>
        <button class="btn outline" data-act="diag" data-id="${c.id}" title="Her adımı ayrı ayrı dener ve sorunu açıklar"><i class="ico ico-bolt"></i>Tanılama</button>
        <span class="spacer"></span>
        <button class="btn sm ghost" data-act="sync" data-id="${c.id}" ${c.enabled ? '' : 'disabled'}><i class="ico ico-sync"></i>Senkronla</button>
        <button class="btn sm ghost" data-act="import" data-id="${c.id}" ${c.enabled ? '' : 'disabled'}><i class="ico ico-download"></i>İlanları çek</button>
        ${c.extra ? html`<button class="btn sm ghost" data-act="remove" data-id="${c.id}" title="Bu mağazayı panelden kaldır (siparişleri silinmez)"><i class="ico ico-x"></i>Kaldır</button>` : ''}
      </div>
      <div class="small" data-res></div>
    </div>`;
  }
  function backfill() {
    const on = data.channels.filter((c) => c.enabled && !c.demo);
    const from = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    return html`<div class="card stack" data-bf>
      <div class="row wrap"><div style="flex:1;min-width:200px"><h2>Geçmiş siparişleri aktar</h2><div class="muted small">Seçilen tarih aralığındaki siparişler kanal kanal, haftalık parçalar halinde çekilir. Aynı sipariş iki kez kaydedilmez; stok takibi başlamadan önceki siparişler stoğu düşmez.</div></div></div>
      ${on.length ? html`<div class="row wrap">${on.map((c) => html`<label class="check">${chLogo(c.id, true)}<input type="checkbox" value="${c.id}" data-bfch checked> ${c.name}</label>`)}</div>
      <div class="row wrap"><label class="field" style="flex:1;min-width:150px"><span>Başlangıç</span><input class="input" type="date" data-bffrom value="${from}"></label>
        <label class="field" style="flex:1;min-width:150px"><span>Bitiş</span><input class="input" type="date" data-bfto value="${dayKey()}"></label>
        <button class="btn primary" style="align-self:flex-end" data-act="bfstart"><i class="ico ico-download"></i>Aktarımı başlat</button></div>`
      : html`<div class="muted small">Önce en az bir kanalın API bilgilerini girin.</div>`}
      ${jobs.length ? html`<div class="stack" style="gap:8px">${jobs.map((j) => {
        const pct = j.to_ms > j.from_ms ? Math.round(((j.to_ms - j.cursor_ms) / (j.to_ms - j.from_ms)) * 100) : 100;
        const st = { running: ['info', 'Sürüyor'], done: ['good', 'Tamamlandı'], cancelled: ['', 'İptal edildi'] }[j.status] || ['', j.status];
        return html`<div class="cand" style="flex-wrap:wrap" data-job="${j.id}"><span class="ch-name" style="min-width:130px">${chLogo(j.channel, true)}${ch(j.channel).name}</span>
          <div style="flex:1;min-width:180px"><div class="row small"><span>${date(j.from_ms)} – ${date(j.to_ms)}</span><span class="spacer"></span><b>%${pct}</b></div><div class="prog"><span style="width:${pct}%"></span></div>
            <div class="tiny muted" style="margin-top:4px">${n(j.done)} sipariş işlendi · ${ago(j.updated_at)}${j.error ? html` · <span style="color:var(--bad)">${j.error}</span>` : ''}</div></div>
          <span class="pill ${st[0]}">${st[1]}</span>${j.status === 'running' ? html`<button class="btn sm" data-act="bfrun">Devam et</button><button class="btn sm ghost" data-act="bfcancel">İptal</button>` : ''}</div>`;
      })}</div>${jobs.some((j) => j.status === 'running') ? html`<div class="muted tiny">Aktarım her 15 dakikalık senkronda da kendiliğinden ilerler; sayfayı kapatabilirsiniz.</div>` : ''}` : ''}
    </div>`;
  }
  function draw() {
    const live = data.channels.filter((c) => !c.paused), paused = data.channels.filter((c) => c.paused);
    render(el, html`<div class="stack">
      <div class="notice"><i class="ico ico-key"></i><div>API bilgileri sunucuda <b>şifreli</b> saklanır ve bir daha ekranda açık gösterilmez (gizli alanlar boş bırakılırsa eski değer korunur). Panelde girilen değer, Cloudflare'de tanımlı aynı bilginin önüne geçer.
        ${data.secretSet ? '' : html`<br><b>Öneri:</b> Cloudflare'de <code>PANEL_SECRET</code> (uzun rastgele metin) tanımlayın; yoksa şifreleme panel şifresine bağlıdır ve şifre değişirse API bilgilerini yeniden girmeniz gerekir.`}</div></div>
      <div class="notice good small"><i class="ico ico-sync"></i><div>Tüm aktif kanallar <b>15 dakikada bir</b> otomatik kontrol edilir: yeni/değişen siparişler, ürünler, görseller, varyantlar ve stoklar güncellenir; eşleştirmeler ve kanala özel stok kuralları korunur. Başarısız işlemler yeniden denenir, çözülemeyenler <a class="link" href="#/bildirimler">Bildirimler</a>'e düşer.</div></div>
      <div class="row wrap"><button class="btn primary" data-act="syscheck"><i class="ico ico-bolt"></i>Sistem kontrolü (tüm kanallar)</button><span class="muted small">Bağlı tüm kanalların kimlik, izin, servis ve ayarlarını tek seferde dener; raporu kopyalayıp iletebilirsiniz.</span></div>
      <div class="card row wrap" style="gap:10px"><div style="flex:1;min-width:220px"><h2>Mağaza ekle</h2><div class="muted small">Aynı pazaryerinde ya da ikas'ta birden fazla mağazanız varsa istediğiniz kadar ekleyin; her mağaza kendi API bilgileriyle ayrı çalışır.</div></div>
        <select class="input" data-addtype style="width:auto">${TYPES.map((t) => html`<option value="${t}">${TYPE_NAME[t]}</option>`)}<optgroup label="Yakında">${SOON.map((t) => html`<option disabled>${t} — yakında</option>`)}</optgroup></select>
        <button class="btn primary" data-act="add"><i class="ico ico-plus"></i>Mağaza ekle</button>
        <div style="flex-basis:100%" class="row wrap small"><span class="muted">Yakında:</span>${SOON.map((t) => html`<span class="pill" title="Yakında sisteme entegre edilecek">${t} <span class="muted tiny">yakında</span></span>`)}</div></div>
      <div class="integ">${live.map(card)}</div>
      ${backfill()}
      ${paused.length ? html`<h2 style="margin:8px 0 0">Bağlanmamış / pasif kanallar</h2>
        <p class="muted small" style="margin:0">API bilgilerini girip <b>Kaydet</b>, ardından <b>Bağlantıyı test et</b>'e basın; bağlantı doğrulanınca kanal siparişler, ürünler ve stok ekranlarına eklenir.</p><div class="integ">${paused.map(card)}</div>` : ''}
    </div>`);
  }
  const values = (id) => { const o = {}; $$(`[data-ch="${id}"] [data-k]`, el).forEach((i) => { o[i.dataset.k] = i.value; }); return o; };
  const after = async () => { await loadSummary().catch(() => {}); await load(); };
  actions(el, {
    syscheck: () => systemCheck(data.channels.filter((c) => (c.enabled && !c.paused) || (c.gated && !(c.missing || []).length)).map((c) => ({ id: c.id, name: c.name }))),
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
    add: (t) => busy(t, async () => {
      const type = $('[data-addtype]', el).value;
      const r = await api('integrations/add', { method: 'POST', body: { type } });
      toast(`${TYPE_NAME[type]}: yeni mağaza eklendi — API bilgilerini girin`); await after();
      const card = $(`[data-ch="${r.id}"]`, el); if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); const i = $('[data-k]', card); if (i) i.focus(); }
    }),
    remove: async (t) => {
      const id = t.dataset.id;
      if (!(await confirmBox(`${ch(id).name || id} mağazası panelden kaldırılsın mı? API bilgileri silinir; geçmiş siparişler ve raporlar korunur.`, 'Kaldır'))) return;
      await api(`integrations/${id}/remove`, { method: 'POST' }); toast('Mağaza kaldırıldı'); await after();
    },
    diag: (t) => diagnoseDialog(t.dataset.id),
    bfstart: (t) => busy(t, async () => {
      const box = $('[data-bf]', el), channels = $$('[data-bfch]', box).filter((x) => x.checked).map((x) => x.value);
      const r = await api('backfill', { method: 'POST', body: { channels, from: $('[data-bffrom]', box).value, to: $('[data-bfto]', box).value } });
      toast(`Aktarım başladı${r.run ? ': ' + Object.entries(r.run).map(([k, v]) => `${ch(k).name} ${typeof v === 'string' ? v : v.done + ' sipariş'}`).join(', ') : ''}`); await after();
    }),
    bfrun: (t) => busy(t, async () => { await api('backfill/run', { method: 'POST' }); await after(); }),
    bfcancel: (t) => busy(t, async () => { await api(`backfill/${encodeURIComponent(t.closest('[data-job]').dataset.job)}/cancel`, { method: 'POST' }); toast('İptal edildi'); await after(); }),
    clear: async (t) => {
      if (!(await confirmBox('Panelde kayıtlı bu gizli değer silinsin mi? (Cloudflare\'de tanımlıysa o kullanılır.)', 'Sil'))) return;
      await api('integrations/' + t.dataset.id, { method: 'PUT', body: { clear: [t.dataset.k] } }); toast('Silindi'); await after();
    },
  });
  el.addEventListener('change', async (e) => {
    const h = e.target.dataset.hold;
    if (h) {
      try {
        const cur = new Set((state.settings && state.settings.hold_channels) || []);
        if (e.target.checked) cur.add(h); else cur.delete(h);
        state.settings = await api('settings', { method: 'PUT', body: { hold_channels: [...cur] } });
        toast(e.target.checked ? `${ch(h).name}: kanala yazma beklemede (yalnızca okunuyor)` : `${ch(h).name}: kanala yazma açıldı`); await after();
      } catch (err) { toast(err.message, true); }
      return;
    }
    const id = e.target.dataset.active;
    if (!id) return;
    try { await api('integrations/' + id, { method: 'PUT', body: { active: e.target.checked } }); toast(e.target.checked ? `${ch(id).name} aktif` : `${ch(id).name} pasif: senkronlanmaz`); await after(); } catch (err) { toast(err.message, true); }
  });
  await load().catch((e) => render(el, html`<div class="notice bad">${e.message}</div>`));
  return { refresh: load };
}
