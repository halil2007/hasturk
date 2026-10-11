// Veri sağlık kontrolü: para hesaplarının dayandığı varsayımlar firmanın kendi verisiyle sınanır (bkz. src/health.js).
// Her kart: ✓ tutarlı / ⚠ şüpheli / — veri yok, sayılar, açıklama ve ne yapılmalı. "Destek'e gönder" teknik özeti destek talebine koyar.
import { api, html, $, ago, dateTime, toast, busy, sheet } from '../core.js';
import { openTicketForm } from './support.js';

const MARK = { ok: ['good', '✓', 'Tutarlı'], warn: ['amber', '!', 'Şüpheli'], none: ['none', '—', 'Veri yok'] };
const GROUPS = [['money', 'Para hesapları (komisyon, hakediş, kargo)'], ['sync', 'Senkron ve gönderim']];
const RANK = { warn: 0, ok: 1, none: 2 };

function card(c) {
  const [cls, ic, label] = MARK[c.status] || MARK.none;
  return html`<details class="card" ${c.status === 'warn' ? 'open' : ''} style="padding:0">
    <summary class="row" style="cursor:pointer;gap:12px;padding:12px 14px;align-items:center">
      <span class="diag-ic ${cls}" style="${cls === 'none' ? 'background:var(--surface-3);color:var(--muted)' : ''}" aria-label="${label}">${ic}</span>
      <div style="min-width:0;flex:1"><b>${c.title}</b><div class="small ${c.status === 'warn' ? '' : 'muted'}" style="word-break:break-word">${c.summary}</div></div>
      <span class="pill ${c.status === 'warn' ? 'warn' : c.status === 'ok' ? 'good' : ''} tiny">${label}</span>
    </summary>
    <div class="stack" style="gap:8px;padding:0 14px 14px clamp(14px, 7vw, 52px)">
      ${c.numbers && c.numbers.length ? html`<table class="small" style="border-collapse:collapse;width:100%">${c.numbers.map(([k, v]) => html`<tr><td class="muted" style="padding:2px 12px 2px 0;vertical-align:top;width:45%">${k}</td><td class="num" style="padding:2px 0;word-break:break-word">${v}</td></tr>`)}</table>` : ''}
      ${c.explain ? html`<div class="tiny muted">${c.explain}</div>` : ''}
      ${c.action ? html`<div class="small"><b>Ne yapmalı:</b> ${c.action}</div>` : ''}
    </div>
  </details>`;
}

export function healthSheet() {
  const s = sheet({ title: 'Veri sağlık kontrolü', size: 'wide drawer', body: html`<div class="empty"><i class="ico ico-sync spin"></i> Kontrol ediliyor…</div>` });
  let rep = null;
  const draw = () => {
    const sm = rep.summary, checks = [...rep.checks].sort((a, b) => RANK[a.status] - RANK[b.status]);
    s.setBody(html`<div class="stack">
      <div class="notice ${sm.warn ? 'warn' : 'good'} small"><i class="ico ico-${sm.warn ? 'warn' : 'check'}"></i><div>
        Panelin kâr, komisyon, hakediş ve iade maliyeti hesapları pazaryeri verisiyle ilgili bazı <b>varsayımlara</b> dayanır. Bu ekran onları sizin kayıtlarınızla sınar.
        <div style="margin-top:6px"><span class="pill good tiny">${sm.ok} tutarlı</span> <span class="pill warn tiny">${sm.warn} şüpheli</span> <span class="pill tiny">${sm.none} veri yok</span>
        <span class="muted tiny"> · Son kontrol <span title="${dateTime(rep.at)}">${ago(rep.at)}</span>${rep.cached ? ' (1 saatte bir yenilenir)' : ''}</span></div>
        ${sm.warn ? html`<div style="margin-top:6px">Şüpheli bulguları <b>Destek'e gönder</b> ile bize iletin: teknik özet talebe eklenir, hesap düzeltilir.</div>` : ''}
      </div></div>
      ${GROUPS.map(([g, t]) => { const list = checks.filter((c) => (c.group || 'money') === g); return list.length ? html`<h3 style="margin:6px 0 0">${t}</h3><div class="stack" style="gap:8px">${list.map(card)}</div>` : ''; })}
    </div>`);
    s.setFoot(html`<button class="btn" data-again><i class="ico ico-sync"></i>Yenile</button><button class="btn" data-copy><i class="ico ico-copy"></i>Kopyala</button><span class="spacer"></span>
      <button class="btn ${sm.warn ? 'primary' : ''}" data-ticket><i class="ico ico-send"></i>Destek'e gönder</button>`);
    s.foot.style.flexWrap = 'wrap';
    $('[data-again]', s.el).onclick = (e) => busy(e.currentTarget, () => load(true));
    $('[data-copy]', s.el).onclick = () => navigator.clipboard.writeText(rep.ticket.body).then(() => toast('Rapor kopyalandı'), () => toast('Kopyalanamadı', true));
    $('[data-ticket]', s.el).onclick = () => { s.close(); openTicketForm({ category: 'bug', subject: rep.ticket.subject, body: rep.ticket.body }); };
  };
  async function load(force = false) {
    try { rep = await api('health/data' + (force ? '?force=1' : '')); draw(); } catch (e) { s.setBody(html`<div class="notice bad">${e.message}</div>`); }
  }
  load();
  return s;
}
