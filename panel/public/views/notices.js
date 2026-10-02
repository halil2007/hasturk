// Bildirimler: senkron, stok gönderimi ve geçmiş aktarımda yeniden denemeye rağmen çözülemeyen hatalar burada toplanır.
// Sorun bir sonraki başarılı senkronda kendiliğinden kapanır; elle de "çözüldü" işaretlenebilir.
import { api, html, render, $, n, chBadge, dateTime, ago, actions, busy, toast } from '../core.js';
import { setQuery, loadSummary } from '../app.js';

const LEVEL = { error: ['bad', 'Hata'], warn: ['amber', 'Uyarı'], info: ['info', 'Bilgi'] };

export async function notices(el, rest, query = {}) {
  const f = { all: query.all === '1' };
  let rows = [], logs = [];
  render(el, html`<div class="stack">
    <div class="row wrap"><div class="tabs" data-tabs></div><span class="spacer"></span><button class="btn" data-act="sync"><i class="ico ico-sync"></i>Şimdi senkronla</button></div>
    <div data-box></div>
    <div class="card flush"><div class="card-pad row"><h3 style="flex:1">Son işlemler</h3><span class="muted tiny">senkron, stok ve kullanıcı işlemleri</span></div><div data-logs></div></div>
  </div>`);

  function draw() {
    render($('[data-tabs]', el), html`<button class="tab ${!f.all ? 'on' : ''}" data-act="tab" data-k="">Açık<span class="n">${rows.filter((x) => !x.resolved_at).length}</span></button><button class="tab ${f.all ? 'on' : ''}" data-act="tab" data-k="1">Tümü</button>`);
    render($('[data-box]', el), !rows.length
      ? html`<div class="card"><div class="empty"><i class="ico ico-check" style="color:var(--good)"></i> Çözülmemiş sorun yok. Tüm kanallar düzenli senkronlanıyor.</div></div>`
      : html`<div class="stack" style="gap:10px">${rows.map((x) => {
        const [cls, label] = LEVEL[x.level] || LEVEL.info;
        return html`<div class="card row" style="align-items:flex-start;${x.resolved_at ? 'opacity:.6' : ''}" data-id="${x.id}">
          <span class="pill ${cls}">${label}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:650">${x.title}${!x.read ? html` <span class="dot-red" style="position:static;display:inline-block;vertical-align:middle"></span>` : ''}</div>
            <div class="small" style="margin-top:4px;word-break:break-word">${x.msg}</div>
            <div class="row muted tiny wrap" style="margin-top:6px;gap:12px">${x.channel ? chBadge(x.channel) : ''}<span>İlk: ${dateTime(x.first_at)}</span><span>Son: ${ago(x.last_at)}</span>${x.count > 1 ? html`<span>${n(x.count)} kez tekrarlandı</span>` : ''}${x.resolved_at ? html`<span>Çözüldü: ${dateTime(x.resolved_at)}</span>` : ''}</div>
          </div>
          ${x.resolved_at ? '' : html`<button class="btn sm" data-act="resolve">Çözüldü</button>`}
        </div>`;
      })}</div>`);
    render($('[data-logs]', el), logs.length ? html`<div class="table-wrap"><table class="t"><tbody>${logs.slice(0, 60).map((l) => html`<tr><td class="muted tiny" style="white-space:nowrap">${dateTime(l.at)}</td><td>${l.channel ? chBadge(l.channel) : ''}</td><td class="small ${l.level === 'error' ? 'bad' : ''}" style="${l.level === 'error' ? 'color:var(--bad)' : ''}">${l.msg}</td></tr>`)}</tbody></table></div>` : html`<div class="empty">Kayıt yok</div>`);
  }
  async function load() {
    setQuery({ all: f.all ? '1' : '' });
    [rows, logs] = await Promise.all([api('notices' + (f.all ? '?all=1' : '')), api('logs').catch(() => [])]);
    draw();
    if (rows.some((x) => !x.read)) api('notices/read', { method: 'POST' }).then(loadSummary).catch(() => {});
  }
  const refresh = () => load().catch((e) => toast(e.message, true));
  actions(el, {
    tab: (t) => { f.all = !!t.dataset.k; refresh(); },
    resolve: (t) => busy(t, async () => { await api(`notices/${t.closest('[data-id]').dataset.id}/resolve`, { method: 'POST' }); toast('Çözüldü olarak işaretlendi'); loadSummary().catch(() => {}); refresh(); }),
    sync: (t) => busy(t, async () => { const r = await api('sync', { method: 'POST', body: { force: true } }); toast(r.skipped || 'Senkron tamamlandı'); await loadSummary(); refresh(); }),
  });
  await refresh();
  return { refresh };
}
