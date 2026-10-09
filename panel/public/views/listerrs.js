// İlan hataları penceresi: hatalar nedenine göre gruplanır, her grup için "ne oldu / ne yapmalı" açıklaması ve örnek ilanlar;
// "Yeniden dene" hatayı temizler, stok / fiyat bir sonraki senkronda (ya da hemen) yeniden gönderilir.
import { api, html, ch, chLogo, n, busy, toast, sheet } from '../core.js';
import { explainError } from '../listerr.js';

const groupView = (g) => html`<div class="card stack" style="padding:14px;gap:6px">
  <div class="row" style="gap:8px;align-items:flex-start"><span class="pill bad">${n(g.count)}</span>
    <div style="flex:1"><b>${g.kind ? `${g.kind}: ` : ''}${g.title}</b>${g.channel ? html` <span class="muted tiny">${chLogo(g.channel, true)}${ch(g.channel).name}</span>` : ''}
      <div class="small" style="margin-top:4px">${g.fix}</div>
      <div class="muted tiny" style="margin-top:4px">Kanalın mesajı: <code style="white-space:normal">${g.text}</code></div></div></div>
  ${g.items && g.items.length ? html`<details><summary class="tiny link">Örnek ilanlar${g.count > g.items.length ? ` (ilk ${g.items.length})` : ''}</summary>
    <ul class="tiny" style="margin:6px 0 0;padding-left:18px">${g.items.map((x) => html`<li>${x.name || x.sku || x.remote_id} <span class="muted">· ${x.barcode || x.sku || x.remote_id}</span></li>`)}</ul></details>` : ''}
</div>`;

export async function listingErrorsSheet(channel, done) {
  const s = sheet({ title: channel ? `${ch(channel).name}: hatalı ilanlar` : 'Hatalı ilanlar', size: 'wide' });
  const load = async () => {
    s.setBody(html`<div class="empty"><i class="ico ico-sync spin"></i></div>`);
    const r = await api('listings/errors' + (channel ? `?channel=${encodeURIComponent(channel)}` : ''));
    s.setBody(r.total ? html`<div class="stack">
      <div class="muted small">${n(r.total)} ilanda stok ya da fiyat kanala gönderilemedi. Hatalar nedenine göre gruplandı; çoğu kanal tarafında düzelince kendiliğinden kaybolur.</div>
      ${r.groups.map(groupView)}</div>` : html`<div class="empty"><i class="ico ico-check"></i><div>Hatalı ilan yok</div></div>`);
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
  const groups = listings.filter((l) => l.error).map((l) => ({ channel: l.channel, count: 1, items: [], ...explainError(l.error) }));
  sheet({ title: `${p.name || 'Ürün'}: ilan hataları`, size: 'wide', body: html`<div class="stack">${groups.map(groupView)}
    <div class="muted tiny">Tüm kanallardaki hatalar ve toplu "yeniden dene" için: Entegrasyonlar → kanal kartındaki "hatalı" bağlantısı.</div></div>` });
}
