// Bağlantı tanılaması: kanalın her adımını (kimlik, izinler, servisler, depo adresi, kargo ayarları ve isteğe bağlı
// bir siparişin paket / barkod / etiket durumu) ayrı ayrı dener ve sonucu açıklar. Rapor kopyalanıp destek için iletilebilir.
import { api, html, $, ch, sheet, toast, busy, dateTime } from '../core.js';

const ICON = (ok) => (ok === true ? ['good', '✓'] : ok === false ? ['bad', '✗'] : ['amber', '!']);

export function diagnoseDialog(channelId, orderId, orderNo) {
  const s = sheet({ title: `${ch(channelId).name} · bağlantı tanılaması${orderNo ? ` · #${orderNo}` : ''}`, size: 'wide drawer' });
  let report = '';
  const run = async () => {
    s.setBody(html`<div class="empty"><i class="ico ico-sync spin"></i> ${ch(channelId).name}'a adım adım soruluyor…</div>`);
    try {
      const r = await api(`integrations/${channelId}/diagnose`, { method: 'POST', body: { order_id: orderId || undefined } });
      const bad = r.checks.filter((c) => c.ok === false).length, warn = r.checks.filter((c) => c.ok == null).length;
      report = [`${ch(channelId).name} tanılama · ${dateTime(r.at)}${orderNo ? ` · sipariş #${orderNo}` : ''}`, ...r.checks.map((c) => `[${ICON(c.ok)[1]}] ${c.name}: ${c.detail || ''}`)].join('\n');
      s.setBody(html`<div class="stack">
        <div class="notice ${bad ? 'bad' : warn ? 'warn' : 'good'}"><i class="ico ico-${bad ? 'warn' : 'check'}"></i><div>${bad ? `${bad} adımda sorun bulundu. Kırmızı satırlardaki açıklamayı izleyin; çözemezseniz “Raporu kopyala” ile iletin.` : warn ? 'Bağlantı çalışıyor; sarı satırları kontrol edin.' : 'Tüm adımlar başarılı.'}</div></div>
        <div class="diag">${r.checks.map((c) => { const [cls, ic] = ICON(c.ok); return html`<div class="diag-row"><span class="diag-ic ${cls}">${ic}</span><div style="min-width:0;flex:1"><b>${c.name}</b><div class="small" style="white-space:pre-wrap;word-break:break-word">${c.detail || ''}</div></div></div>`; })}</div>
      </div>`);
    } catch (e) { s.setBody(html`<div class="notice bad">${e.message}</div>`); }
  };
  s.setFoot(html`<button class="btn" data-copy><i class="ico ico-copy"></i>Raporu kopyala</button><span class="spacer"></span><button class="btn" data-again><i class="ico ico-sync"></i>Tekrar dene</button><button class="btn primary" data-close>Kapat</button>`);
  $('[data-copy]', s.el).onclick = () => navigator.clipboard.writeText(report).then(() => toast('Rapor kopyalandı'), () => toast('Kopyalanamadı', true));
  $('[data-again]', s.el).onclick = (e) => busy(e.currentTarget, run);
  run();
}
