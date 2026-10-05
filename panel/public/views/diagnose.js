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

// Sistem kontrolü: tüm bağlı kanalların tanılaması sırayla çalışır, tek raporda toplanır (kopyalanıp iletilebilir)
export function systemCheck(channels) {
  const s = sheet({ title: 'Sistem kontrolü · tüm kanallar', size: 'wide drawer' });
  const res = new Map();
  let report = '';
  const draw = (busyId) => {
    report = [`Sistem kontrolü · ${dateTime(Date.now())}`, ...channels.flatMap((c) => { const r = res.get(c.id); return r ? [`\n== ${c.name} ==`, ...(r.error ? [`[✗] ${r.error}`] : r.checks.map((x) => `[${ICON(x.ok)[1]}] ${x.name}: ${x.detail || ''}`))] : []; })].join('\n');
    s.setBody(html`<div class="stack">${channels.map((c) => {
      const r = res.get(c.id);
      const bad = r && (r.error ? 1 : r.checks.filter((x) => x.ok === false).length), warn = r && !r.error ? r.checks.filter((x) => x.ok == null).length : 0;
      return html`<details class="card" ${bad ? 'open' : ''}><summary class="row" style="cursor:pointer;gap:10px"><b style="flex:1">${c.name}</b>${!r ? (busyId === c.id ? html`<span class="small muted"><i class="ico ico-sync spin"></i> kontrol ediliyor…</span>` : html`<span class="small muted">sırada</span>`)
        : bad ? html`<span class="pill bad">${bad} sorun</span>` : warn ? html`<span class="pill warn">${warn} uyarı</span>` : html`<span class="pill good">sorunsuz</span>`}</summary>
        ${r ? (r.error ? html`<div class="notice bad small" style="margin-top:8px">${r.error}</div>` : html`<div class="diag" style="margin-top:8px">${r.checks.map((x) => { const [cls, ic] = ICON(x.ok); return html`<div class="diag-row"><span class="diag-ic ${cls}">${ic}</span><div style="min-width:0;flex:1"><b>${x.name}</b><div class="small" style="white-space:pre-wrap;word-break:break-word">${x.detail || ''}</div></div></div>`; })}</div>`) : ''}
      </details>`;
    })}</div>`);
  };
  s.setFoot(html`<button class="btn" data-copy><i class="ico ico-copy"></i>Raporu kopyala</button><span class="spacer"></span><button class="btn primary" data-close>Kapat</button>`);
  $('[data-copy]', s.el).onclick = () => navigator.clipboard.writeText(report).then(() => toast('Rapor kopyalandı'), () => toast('Kopyalanamadı', true));
  (async () => {
    for (const c of channels) {
      draw(c.id);
      try { res.set(c.id, await api(`integrations/${c.id}/diagnose`, { method: 'POST', body: {} })); } catch (e) { res.set(c.id, { error: e.message }); }
    }
    draw(null);
  })();
}
