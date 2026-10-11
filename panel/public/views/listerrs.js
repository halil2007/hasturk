// İlan hataları penceresi: hatalar nedenine göre gruplanır, her grup için "ne oldu / ne yapmalı" açıklaması ve örnek ilanlar;
// "Yeniden dene" hatayı temizler, stok / fiyat bir sonraki senkronda (ya da hemen) yeniden gönderilir.
import { api, html, ch, chLogo, n, busy, toast, sheet } from '../core.js';
import { explainError, realError, isChannelSide, channelStateText } from '../listerr.js';

const groupView = (g) => html`<div class="card stack" style="padding:14px;gap:6px">
  <div class="row" style="gap:8px;align-items:flex-start"><span class="pill bad">${n(g.count)}</span>
    <div style="flex:1"><b>${g.kind ? `${g.kind}: ` : ''}${g.title}</b>${g.channel ? html` <span class="muted tiny">${chLogo(g.channel, true)}${ch(g.channel).name}</span>` : ''}
      <div class="small" style="margin-top:4px">${g.fix}</div>
      <div class="muted tiny" style="margin-top:4px">Kanalın mesajı: <code style="white-space:normal">${g.text}</code></div></div></div>
  ${g.items && g.items.length ? html`<details><summary class="tiny link">Örnek ilanlar${g.count > g.items.length ? ` (ilk ${g.items.length})` : ''}</summary>
    <ul class="tiny" style="margin:6px 0 0;padding-left:18px">${g.items.map((x) => html`<li>${x.name || x.sku || x.remote_id} <span class="muted">· ${x.barcode || x.sku || x.remote_id}</span></li>`)}</ul></details>` : ''}
</div>`;

// Kanal kaynaklı grup: kanalın onaylamadığı / onay beklediği ilanlar ya da kanal kaynaklı hata (panel hatası değil; gri, açıklamalı)
const sideView = (g) => {
  const name = ch(g.channel).name, t = channelStateText(g.state ? { remote_state: g.state, remote_state_note: g.note } : { error: g.error, error_side: 'channel' }, name);
  return html`<div class="card stack" style="padding:14px;gap:6px">
  <div class="row" style="gap:8px;align-items:flex-start"><span class="pill">${n(g.count)}</span>
    <div style="flex:1"><b>${t.short.replace(/^./, (c) => c.toLocaleUpperCase('tr'))}</b> <span class="muted tiny">${chLogo(g.channel, true)}${name}</span>
      <div class="small" style="margin-top:4px">${t.fix}</div>
      ${g.state && g.linked < g.count ? html`<div class="muted tiny" style="margin-top:4px">${n(g.linked)} tanesi panel ürününe bağlı; diğerleri kanaldaki ürün havuzunda.</div>` : ''}</div></div>
  ${g.items && g.items.length ? html`<details><summary class="tiny link">Örnek ilanlar${g.count > g.items.length ? ` (ilk ${g.items.length})` : ''}</summary>
    <ul class="tiny" style="margin:6px 0 0;padding-left:18px">${g.items.map((x) => html`<li>${x.name || x.sku || x.remote_id} <span class="muted">· ${x.barcode || x.sku || x.remote_id}</span></li>`)}</ul></details>` : ''}
</div>`;
};

export async function listingErrorsSheet(channel, done) {
  const s = sheet({ title: channel ? `${ch(channel).name}: ilan durumları` : 'İlan durumları', size: 'wide' });
  const load = async () => {
    s.setBody(html`<div class="empty"><i class="ico ico-sync spin"></i></div>`);
    const r = await api('listings/errors' + (channel ? `?channel=${encodeURIComponent(channel)}` : ''));
    const side = r.channelSide || { total: 0, groups: [] };
    s.setBody(r.total || side.total ? html`<div class="stack">
      ${r.total ? html`<h3 style="margin:0">Hatalı (${n(r.total)})</h3><div class="muted small">${n(r.total)} ilanda stok ya da fiyat kanala gönderilemedi. Hatalar nedenine göre gruplandı; çoğu kanal tarafında düzelince kendiliğinden kaybolur.</div>
      ${r.groups.map(groupView)}` : html`<div class="muted small"><i class="ico ico-check"></i> Panel kaynaklı hatalı ilan yok.</div>`}
      ${side.total ? html`<h3 style="margin:8px 0 0">Kanal kaynaklı (${n(side.total)})</h3><div class="muted small">Bu ilanları kanal henüz yayına almadı (onay bekliyor, eksik bilgi ya da red) ya da kanal ilanı satıştaki ürünleri arasında bulamıyor. Panelden kaynaklanmaz ve hata sayılmaz: bu ilanlara stok / fiyat gönderilmez, kanal yayına alınca otomatik gönderilir.</div>
      ${side.groups.map(sideView)}` : ''}</div>` : html`<div class="empty"><i class="ico ico-check"></i><div>Hatalı ilan yok</div></div>`);
    s.setFoot(r.total ? html`<button class="btn ghost" data-close>Kapat</button><button class="btn primary" data-retry><i class="ico ico-sync"></i>Hepsini yeniden dene</button>` : '');
    const b = s.foot.querySelector('[data-retry]');
    if (b) b.onclick = () => busy(b, async () => {
      const x = await api('listings/errors/retry', { method: 'POST', body: { channel } });
      toast(`${n(x.n)} ilan yeniden gönderilecek; sonuç birkaç dakika içinde görünür`);
      api('sync', { method: 'POST', body: { channels: channel ? [channel] : undefined } }).catch(() => {});
      done && done(); s.close();
    });
  };
  await load();
}

// Bir ürünün ilan hataları (Ürünler listesindeki "N hata" rozeti): sunucuya gitmeden açıklanır
export function productErrorsSheet(p, listings) {
  const groups = listings.filter(realError).map((l) => ({ channel: l.channel, count: 1, items: [], ...explainError(l.error) }));
  sheet({ title: `${p.name || 'Ürün'}: ilan hataları`, size: 'wide', body: html`<div class="stack">${groups.map(groupView)}
    <div class="muted tiny">Tüm kanallardaki hatalar ve toplu "yeniden dene" için: Entegrasyonlar → kanal kartındaki "hatalı" bağlantısı.</div></div>` });
}
