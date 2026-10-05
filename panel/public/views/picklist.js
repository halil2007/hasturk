// Toplama listesi: kargoya çıkacak siparişlerdeki ürünlerin toplamı (depoda tek turda toplanır), yazdırılabilir.
import { api, html, render, $, n, ch, chLogo, thumb, sheet, busy, esc, dateTime } from '../core.js';

export async function pickSheet({ channel = '', ids = [] } = {}) {
  const s = sheet({ title: 'Toplama listesi', size: 'wide', body: html`<div class="empty"><i class="ico ico-sync spin"></i></div>` });
  const q = new URLSearchParams();
  if (channel) q.set('channel', channel);
  if (ids.length) q.set('ids', ids.join(','));
  const d = await api('picklist?' + q, { fresh: true }).catch((e) => { s.setBody(html`<div class="notice bad">${e.message}</div>`); return null; });
  if (!d) return;
  const scope = ids.length ? `${ids.length} seçili sipariş` : channel ? `${ch(channel).name} · kargoya çıkacak siparişler` : 'Kargoya çıkacak tüm siparişler';
  s.setBody(!d.items.length ? html`<div class="empty">Toplanacak ürün yok — kargoya çıkacak sipariş bulunmuyor 🎉</div>` : html`<div class="stack">
    <div class="row wrap small"><b>${scope}</b><span class="muted">· ${n(d.orders)} sipariş · ${n(d.items.length)} çeşit · <b>${n(d.totalQty)} adet</b></span></div>
    <div class="table-wrap" style="max-height:60vh;overflow:auto"><table class="t"><thead><tr><th>Ürün</th><th class="r">Adet</th><th class="r">Stok</th><th>Kanallar</th></tr></thead><tbody>
      ${d.items.map((x) => html`<tr><td><div class="row">${thumb(x.image, x.name, 'sm')}<div style="min-width:0"><div style="font-weight:650">${x.name}${x.variant ? html`<span class="var-tag">${x.variant}</span>` : ''}</div><div class="muted tiny">${[x.sku, x.barcode].filter(Boolean).join(' · ') || '—'} · ${x.orders.length} sipariş</div></div></div></td>
        <td class="r num" style="font-size:18px;font-weight:750">${x.qty}</td>
        <td class="r num ${x.stock != null && x.stock < x.qty ? 'neg' : 'muted'}" style="${x.stock != null && x.stock < x.qty ? 'color:var(--bad);font-weight:650' : ''}" title="${x.stock != null && x.stock < x.qty ? 'Stok yetmiyor' : ''}">${x.stock ?? '—'}</td>
        <td><div class="row wrap" style="gap:6px">${Object.entries(x.channels).map(([c, k]) => html`<span class="row tiny">${chLogo(c, true)}${k}</span>`)}</div></td></tr>`)}
    </tbody></table></div></div>`);
  s.setFoot(d.items.length ? html`<span class="spacer"></span><button class="btn" data-close>Kapat</button><button class="btn primary" data-print><i class="ico ico-print"></i>Yazdır</button>` : null);
  const pb = $('[data-print]', s.el);
  if (pb) pb.onclick = () => printList(d, scope);
}

// Yazdırma: ayrı pencerede sade tablo (işaret kutusu, adet büyük); sipariş numaraları her ürünün altında
function printList(d, scope) {
  const w = window.open('', '_blank');
  if (!w) return alert('Yazdırma penceresi açılamadı (açılır pencere engelini kaldırın)');
  const rows = d.items.map((x) => `<tr><td class="box"></td><td><b>${esc(x.name)}</b>${x.variant ? ` <span class="v">${esc(x.variant)}</span>` : ''}<div class="m">${esc([x.sku, x.barcode].filter(Boolean).join(' · '))}</div>
    <div class="o">${x.orders.map((o) => `${esc(ch(o.channel).short || ch(o.channel).name)} #${esc(o.order_number)}${o.qty > 1 ? ` ×${o.qty}` : ''}`).join(' · ')}</div></td><td class="q">${x.qty}</td><td class="s">${x.stock ?? ''}</td></tr>`).join('');
  w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Toplama listesi</title><style>
    body{font:13px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:16px;color:#111}h1{font-size:18px;margin:0 0 4px}.sub{color:#555;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ccc;padding:7px 6px;vertical-align:top;text-align:left}th{font-size:11px;text-transform:uppercase;color:#555}
    .box{width:18px}.box:before{content:'';display:inline-block;width:14px;height:14px;border:1.5px solid #333;border-radius:3px}.q{font-size:20px;font-weight:800;text-align:right;width:60px}.s{text-align:right;color:#666;width:50px}
    .v{background:#eee;border-radius:4px;padding:0 5px;font-size:12px}.m{color:#555;font-size:11px}.o{color:#777;font-size:10.5px;margin-top:2px}@media print{body{margin:8mm}}
  </style></head><body><h1>Toplama listesi</h1><div class="sub">${esc(scope)} · ${d.orders} sipariş · ${d.items.length} çeşit · <b>${d.totalQty} adet</b> · ${esc(dateTime(Date.now()))}</div>
  <table><thead><tr><th></th><th>Ürün</th><th style="text-align:right">Adet</th><th style="text-align:right">Stok</th></tr></thead><tbody>${rows}</tbody></table>
  <script>window.onload=function(){window.print()}<\/script></body></html>`);
  w.document.close();
}
