// Blog (yalnız ana panel yöneticisi): yazı listesi ve düzenleyici. Yazı Markdown ile yazılır (araç çubuğu biçimleri ekler, önizleme sitedeki
// görünüme yakındır). Görseller tarayıcıda küçültülür (en uzun kenar 1600 px, WebP; desteklenmezse JPEG; ~400 KB altı) ve panele yüklenir.
// Yayındaki yazılar tanıtım sitesinde (hasturkcrm.com/blog) görünür; site birkaç dakikalık önbellek kullanır.
import { api, html, raw, render, $, $$, actions, busy, toast, confirmBox, dateTime, date, ago, debounce } from '../core.js';
import { mdToHtml, slugify, mdText } from '../blogmd.js';

const IMG = (id) => `/api/public/blog/img/${id}`;
const ST = { draft: ['', 'Taslak'], published: ['good', 'Yayında'], scheduled: ['amber', 'Zamanlandı'] };
const stOf = (p, now = Date.now()) => (p.status === 'published' && p.published_at > now ? 'scheduled' : p.status);
const host = (u) => String(u || '').replace(/^https?:\/\//, '');

// Görünüme özel stiller (bir kez eklenir)
function styles() {
  if (document.getElementById('blog-css')) return;
  const s = document.createElement('style'); s.id = 'blog-css';
  s.textContent = `
.bl-row { display: flex; gap: 14px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--line); text-decoration: none; color: inherit; }
.bl-row:first-child { border-top: 0; } .bl-row:hover { background: var(--surface-2); }
.bl-cv { flex: none; width: 96px; aspect-ratio: 16/9; border-radius: 8px; background: var(--surface-3) center / cover no-repeat; display: grid; place-items: center; color: var(--muted); }
.bl-tags { display: inline-flex; gap: 4px; flex-wrap: wrap; } .bl-tag { font-size: 11.5px; padding: 1px 8px; border-radius: 99px; background: var(--surface-3); color: var(--text-2); }
.bl-ed { display: grid; gap: 14px; align-items: start; } @media (min-width: 1100px) { .bl-ed { grid-template-columns: minmax(0, 1fr) 320px; } }
.bl-slug { display: flex; align-items: center; border: 1px solid var(--line-2); border-radius: 10px; background: var(--surface-2); overflow: hidden; }
.bl-slug span { padding: 0 4px 0 12px; color: var(--muted); font-size: 13px; white-space: nowrap; } .bl-slug input { border: 0; border-radius: 0; min-height: 38px; background: var(--surface); }
.bl-tools { display: flex; flex-wrap: wrap; gap: 2px; padding: 4px; border: 1px solid var(--line-2); border-bottom: 0; border-radius: 10px 10px 0 0; background: var(--surface-2); }
.bl-tools button { min-width: 34px; height: 32px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; cursor: pointer; font-weight: 700; color: var(--text-2); display: inline-flex; align-items: center; gap: 6px; }
.bl-tools button:hover { background: var(--surface-3); color: var(--text); } .bl-tools .sep { width: 1px; margin: 4px 4px; background: var(--line-2); }
.bl-body { border-radius: 0 0 10px 10px !important; min-height: 420px; font: 14.5px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; resize: vertical; }
.bl-split { display: grid; gap: 14px; } .bl-split.both { grid-template-columns: 1fr 1fr; } .bl-split > [hidden] { display: none; }
.bl-prev { border: 1px solid var(--line); border-radius: 10px; padding: 18px 22px; min-height: 420px; max-height: 76vh; overflow: auto; background: var(--surface); }
.bl-art { font-size: 16px; line-height: 1.7; color: var(--text); overflow-wrap: break-word; }
.bl-art h1 { font-size: 28px; margin: 0 0 8px; } .bl-art h2 { font-size: 22px; margin: 28px 0 8px; } .bl-art h3 { font-size: 18px; margin: 22px 0 6px; } .bl-art h4 { font-size: 16px; margin: 18px 0 6px; }
.bl-art p, .bl-art ul, .bl-art ol, .bl-art blockquote, .bl-art figure, .bl-art pre, .bl-art .tbl { margin: 12px 0; }
.bl-art img { max-width: 100%; height: auto; border-radius: 10px; display: block; } .bl-art figure { margin-left: 0; margin-right: 0; }
.bl-art figcaption { font-size: 13px; color: var(--muted); text-align: center; margin-top: 6px; }
.bl-art blockquote { border-left: 4px solid var(--primary); background: var(--primary-soft); padding: 10px 16px; border-radius: 0 10px 10px 0; }
.bl-art blockquote p { margin: 0; } .bl-art a { color: var(--primary); }
.bl-art code { background: var(--surface-3); padding: 1px 6px; border-radius: 6px; font-size: .9em; } .bl-art pre { background: var(--surface-3); padding: 12px 14px; border-radius: 10px; overflow: auto; } .bl-art pre code { background: none; padding: 0; }
.bl-art table { border-collapse: collapse; width: 100%; font-size: 14px; } .bl-art th, .bl-art td { border: 1px solid var(--line-2); padding: 8px 10px; text-align: left; } .bl-art th { background: var(--surface-2); }
.bl-art .tbl { overflow-x: auto; } .bl-art hr { border: 0; border-top: 1px solid var(--line-2); margin: 24px 0; }
.bl-lead { font-size: 17px; color: var(--text-2); margin: 0 0 14px; }
.bl-cover { aspect-ratio: 16/9; border-radius: 10px; background: var(--surface-3) center / cover no-repeat; border: 1px dashed var(--line-2); display: grid; place-items: center; color: var(--muted); font-size: 13px; text-align: center; }
.bl-gal { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
.bl-gi { position: relative; aspect-ratio: 16/10; border-radius: 8px; background: var(--surface-3) center / cover no-repeat; border: 1px solid var(--line); }
.bl-gi .acts { position: absolute; inset: auto 4px 4px 4px; display: flex; gap: 4px; justify-content: flex-end; opacity: 0; transition: opacity .15s; } .bl-gi:hover .acts, .bl-gi:focus-within .acts { opacity: 1; }
.bl-gi .acts button { height: 26px; padding: 0 8px; border: 0; border-radius: 6px; background: rgb(15 23 42 / .78); color: #fff; font-size: 12px; cursor: pointer; }
.bl-cnt { float: right; font-weight: 500; color: var(--muted); } .bl-cnt.over { color: var(--warn); }
.bl-serp { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: var(--surface); }
.bl-serp .u { font-size: 12px; color: var(--text-2); } .bl-serp .t { color: #1a0dab; font-size: 16px; line-height: 1.3; margin: 2px 0; } .bl-serp .d { font-size: 13px; color: var(--text-2); }
:root[data-theme="dark"] .bl-serp .t { color: #8ab4f8; }
.bl-drop { outline: 2px dashed var(--primary); outline-offset: -4px; }
@media (max-width: 899px) { .bl-split.both { grid-template-columns: 1fr; } .bl-cv { width: 72px; } }`;
  document.head.append(s);
}

// Görseli tarayıcıda küçült: en uzun kenar 1600 px; WebP (desteklenmezse JPEG); ~400 KB altına inene kadar kalite / boyut düşürülür
async function shrink(file, max = 1600, limit = 400 * 1024) {
  if (!/^image\/(png|jpe?g|webp|gif|avif|bmp)$/.test(file.type)) throw new Error('Yalnız görsel (JPG, PNG, WEBP) yüklenebilir');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Görsel okunamadı')); i.src = url; });
    const bytes = (d) => Math.floor(((d.length - d.indexOf(',') - 1) * 3) / 4);
    let k = Math.min(1, max / Math.max(img.width, img.height));
    for (let round = 0; round < 4; round++, k *= 0.8) {
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      for (const type of ['image/webp', 'image/jpeg']) {
        const g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
        if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
        g.drawImage(img, 0, 0, c.width, c.height);
        for (const q of [0.86, 0.78, 0.7, 0.6]) {
          const d = c.toDataURL(type, q);
          if (!d.startsWith('data:' + type)) break; // tarayıcı bu türü üretemiyor
          if (bytes(d) <= limit) return { data: d, w: c.width, h: c.height, size: bytes(d) };
        }
      }
    }
    throw new Error('Görsel küçültülemedi; daha küçük bir görsel seçin');
  } finally { URL.revokeObjectURL(url); }
}
const altOf = (name) => String(name || '').replace(/\.\w+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Görsel';
const pickFiles = (multiple = true) => new Promise((ok) => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = multiple; i.onchange = () => ok([...i.files]); i.click(); });

export async function blogView(root, rest = [], query = {}) {
  styles();
  return rest[0] ? editor(root, rest[0] === 'yeni' ? null : Number(rest[0])) : list(root, query);
}

// ---------- liste ----------
async function list(root, query) {
  const f = { status: ['draft', 'published', 'scheduled'].includes(query.durum) ? query.durum : '', q: '' };
  let d;
  const draw = () => {
    const c = d.counts, now = d.now || Date.now();
    render($('[data-list]', root), d.posts.length ? html`<div class="card flush">${d.posts.map((p) => { const st = ST[stOf(p, now)];
      return html`<a class="bl-row" href="#/blog/${p.id}">
        <span class="bl-cv" style="${p.cover_id ? `background-image:url('${IMG(p.cover_id)}')` : ''}">${p.cover_id ? '' : raw('<i class="ico ico-image"></i>')}</span>
        <div style="flex:1;min-width:0"><div class="row" style="gap:8px"><b class="ellipsis">${p.title}</b></div>
          <div class="tiny muted ellipsis">/blog/${p.slug} · ${p.author || ''} · ~${Math.max(1, Math.round((p.chars || 0) / 1300))} dk okuma</div>
          ${p.tags.length ? html`<div class="bl-tags" style="margin-top:4px">${p.tags.map((t) => html`<span class="bl-tag">${t}</span>`)}</div>` : ''}</div>
        <div style="display:grid;gap:4px;justify-items:end"><span class="pill ${st[0]}">${st[1]}</span>
          <span class="tiny muted" title="${dateTime(p.published_at || p.updated_at)}">${p.status === 'published' ? date(p.published_at) : `düzenlendi ${ago(p.updated_at)}`}</span></div></a>`; })}</div>`
      : html`<div class="card empty">${f.q || f.status ? 'Bu filtrede yazı yok' : html`Henüz yazı yok. <b>Yeni yazı</b> ile ilk yazınızı oluşturun.`}</div>`);
    $$('[data-act="st"]', root).forEach((b) => b.classList.toggle('on', b.dataset.k === f.status));
    const n = { '': c.total, published: c.published - c.scheduled, scheduled: c.scheduled, draft: c.draft };
    $$('[data-act="st"] .n', root).forEach((x) => { x.textContent = n[x.parentElement.dataset.k] || 0; });
  };
  const load = async () => { d = await api('blog' + (f.status || f.q ? `?${new URLSearchParams({ ...(f.status ? { status: f.status } : {}), ...(f.q ? { q: f.q } : {}) })}` : ''), { fresh: true });
    if (f.status === 'published') d.posts = d.posts.filter((p) => stOf(p, d.now) === 'published'); draw(); };
  d = await api('blog', { fresh: true });
  render(root, html`<div class="stack">
    <div class="card row wrap" style="gap:12px;align-items:center">
      <div style="flex:1;min-width:240px"><h2>Blog yazıları</h2><div class="muted small">Yayındaki yazılar <a class="link" href="${d.site}/blog" target="_blank" rel="noopener">${host(d.site)}/blog</a> adresinde görünür (site birkaç dakika içinde güncellenir). Taslaklar yalnız burada görünür.</div></div>
      <button class="btn primary" data-act="new"><i class="ico ico-plus"></i>Yeni yazı</button>
    </div>
    <div class="row wrap" style="gap:10px">
      <div class="tabs" style="flex:1 1 420px">${[['', 'Tümü'], ['published', 'Yayında'], ['scheduled', 'Zamanlanmış'], ['draft', 'Taslak']].map(([k, t]) => html`<button class="tab" data-act="st" data-k="${k}">${t} <span class="n">0</span></button>`)}</div>
      <input class="input" type="search" placeholder="Başlık, adres ya da etiket ara" data-q style="flex:1 1 220px;max-width:320px">
    </div>
    <div data-list></div>
  </div>`);
  if (f.status) await load(); else draw();
  $('[data-q]', root).addEventListener('input', debounce((e) => { f.q = e.target.value.trim(); load().catch((er) => toast(er.message, true)); }, 300));
  actions(root, {
    new: () => { location.hash = '#/blog/yeni'; },
    st: (b) => { f.status = b.dataset.k; load().catch((e) => toast(e.message, true)); },
  });
  return { refresh: load };
}

// ---------- düzenleyici ----------
const TOOLS = [
  ['h2', 'H2', 'Ara başlık'], ['h3', 'H3', 'Alt başlık'], '|', ['b', raw('<b>K</b>'), 'Kalın (Ctrl+B)'], ['i', raw('<i>E</i>'), 'Eğik (Ctrl+I)'], ['link', raw('<i class="ico ico-link"></i>'), 'Bağlantı (Ctrl+K)'], '|',
  ['ul', '• Liste', 'Madde işaretli liste'], ['ol', '1. Liste', 'Numaralı liste'], ['quote', '❝', 'Alıntı / not kutusu'], ['table', 'Tablo', 'Tablo ekle'], ['hr', '—', 'Ayırıcı çizgi'], '|',
  ['img', raw('<i class="ico ico-image"></i>Görsel'), 'Görsel yükle ve imlecin olduğu yere ekle (sürükle-bırak / Ctrl+V da olur)'],
];
const HELP = 'Biçimler: ## Ara başlık · **kalın** · *eğik* · [bağlantı yazısı](https://adres) · - madde · 1. madde · > alıntı · ![açıklama](görsel). Boş satır yeni paragraf başlatır.';

async function editor(root, id) {
  const d = id ? await api(`blog/${id}`, { fresh: true }) : { post: null, images: [], site: (await api('blog')).site };
  const p = d.post || { title: '', slug: '', summary: '', body: '', cover_id: null, tags: [], status: 'draft', published_at: null, author: '', seo_title: '', seo_desc: '' };
  const images = d.images || [], site = d.site || 'https://hasturkcrm.com';
  let slugTouched = !!id, dirty = false, mode = window.matchMedia('(min-width: 1300px)').matches ? 'both' : 'write', cover = p.cover_id, updatedAt = p.updated_at;
  const dtLocal = (ms) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60e3).toISOString().slice(0, 16) : '');
  render(root, html`<div class="stack" data-ed>
    <div class="row wrap" style="gap:8px">
      <a class="btn ghost sm" href="#/blog" data-act="back"><i class="ico ico-back"></i>Blog</a><span class="spacer"></span>
      <span class="pill" data-st></span>
      <a class="btn sm ghost" data-view target="_blank" rel="noopener" hidden><i class="ico ico-eye"></i>Sitede gör</a>
      <button class="btn sm" data-act="save" title="Ctrl+S"><i class="ico ico-check"></i>Kaydet</button>
      <button class="btn sm primary" data-act="publish"></button>
    </div>
    <div class="bl-ed">
      <div class="card stack" style="min-width:0">
        <input class="input big" name="title" maxlength="160" placeholder="Yazının başlığı" value="${p.title}">
        <label class="bl-slug" title="Yazının adresi (Türkçe karakterler dönüştürülür). Yayındaki yazının adresini değiştirirseniz eski bağlantılar çalışmaz."><span>${host(site)}/blog/</span><input class="input" name="slug" maxlength="100" placeholder="baslik-otomatik-uretilir" value="${p.slug}"></label>
        <label class="field"><span>Özet <span class="bl-cnt" data-cnt="summary"></span></span><textarea class="input" name="summary" rows="2" maxlength="320" placeholder="Listede ve arama sonucunda görünen 1–2 cümlelik özet (boşsa yazının başından alınır)">${p.summary}</textarea></label>
        <div class="row wrap" style="gap:8px"><b class="small" style="flex:1">Yazı</b>
          <div class="seg">${[['write', 'Yaz'], ['both', 'Yan yana'], ['preview', 'Önizleme']].map(([k, t]) => html`<button type="button" data-mode="${k}">${t}</button>`)}</div></div>
        <div class="bl-split" data-split>
          <div data-wr><div class="bl-tools">${TOOLS.map((t) => (t === '|' ? raw('<span class="sep"></span>') : html`<button type="button" data-tool="${t[0]}" title="${t[2]}">${t[1]}</button>`))}</div>
            <textarea class="input bl-body" name="body" spellcheck="true" placeholder="Yazınızı buraya yazın…\n\n## Ara başlık\nParagraf metni. **Kalın** ve *eğik* yazabilirsiniz.\n\n- Madde\n- Madde">${p.body}</textarea>
            <div class="tiny muted" style="margin-top:6px">${HELP}</div></div>
          <div class="bl-prev" data-pv><article class="bl-art" data-art></article></div>
        </div>
        <div><div class="row" style="margin-bottom:8px"><b class="small" style="flex:1">Yazının görselleri</b><button class="btn sm" type="button" data-act="upload"><i class="ico ico-upload"></i>Görsel yükle</button></div>
          <div class="bl-gal" data-gal></div></div>
      </div>
      <aside class="stack" style="min-width:0">
        <div class="card stack"><h3>Yayın</h3>
          <label class="field"><span>Yayın tarihi</span><input class="input" type="datetime-local" name="published_at" value="${dtLocal(p.published_at)}"><small>Boşsa yayınladığınız an. İleri bir tarih seçerseniz yazı o gün sitede görünür.</small></label>
          <label class="field"><span>Yazar</span><input class="input" name="author" maxlength="80" value="${p.author}" placeholder="Hastürk CRM"></label>
          <label class="field"><span>Etiketler</span><input class="input" name="tags" value="${p.tags.join(', ')}" placeholder="Kargo, Trendyol, Stok"><small>Virgülle ayırın (en fazla 8). Sitede etikete göre filtrelenir.</small></label>
        </div>
        <div class="card stack"><h3>Kapak görseli</h3>
          <div class="bl-cover" data-cover></div>
          <div class="row" style="gap:6px"><button class="btn sm" type="button" data-act="cover"><i class="ico ico-upload"></i>Kapak yükle</button><button class="btn sm ghost danger" type="button" data-act="nocover">Kaldır</button></div>
          <small class="muted tiny">Listede, yazının başında ve paylaşımlarda (WhatsApp, LinkedIn…) görünür. Önerilen: yatay, 1600×900.</small>
        </div>
        <div class="card stack"><h3>Arama motoru (SEO)</h3>
          <label class="field"><span>SEO başlığı <span class="bl-cnt" data-cnt="seo_title"></span></span><input class="input" name="seo_title" maxlength="90" value="${p.seo_title}" placeholder="Boşsa yazı başlığı"></label>
          <label class="field"><span>SEO açıklaması <span class="bl-cnt" data-cnt="seo_desc"></span></span><textarea class="input" name="seo_desc" rows="3" maxlength="200" placeholder="Boşsa özet">${p.seo_desc}</textarea></label>
          <div class="bl-serp" data-serp></div>
        </div>
        ${id ? html`<div class="card"><button class="btn sm ghost danger" type="button" data-act="del"><i class="ico ico-trash"></i>Yazıyı sil</button></div>` : ''}
      </aside>
    </div>
  </div>`);
  const ed = $('[data-ed]', root), F = (n) => $(`[name="${n}"]`, ed), ta = F('body');
  const imgOpt = { site, image: (iid) => { const m = images.find((x) => x.id === iid); return m ? { src: IMG(iid), w: m.w, h: m.h } : IMG(iid); } };
  const LIM = { summary: 160, seo_title: 60, seo_desc: 155 };

  const preview = () => {
    const t = F('title').value.trim();
    render($('[data-art]', ed), html`<h1>${t || 'Başlık'}</h1>${F('summary').value.trim() ? html`<p class="bl-lead">${F('summary').value.trim()}</p>` : ''}${cover ? raw(`<img src="${IMG(cover)}" alt="" style="margin-bottom:14px">`) : ''}${raw(mdToHtml(ta.value, imgOpt) || '<p class="muted">Önizleme burada görünür.</p>')}`);
  };
  const meta = () => {
    for (const [k, n] of Object.entries(LIM)) { const el = $(`[data-cnt="${k}"]`, ed), l = F(k).value.length; el.textContent = `${l}/${n}`; el.classList.toggle('over', l > n); }
    const slug = F('slug').value || slugify(F('title').value) || 'yazi';
    const desc = F('seo_desc').value.trim() || F('summary').value.trim() || mdText(ta.value).slice(0, 155);
    render($('[data-serp]', ed), html`<div class="u">${host(site)} › blog › ${slug}</div><div class="t">${(F('seo_title').value.trim() || F('title').value.trim() || 'Başlık')} | Hastürk CRM</div><div class="d">${desc.length > 158 ? desc.slice(0, 155) + '…' : desc || 'Açıklama'}</div>`);
  };
  const status = () => {
    const st = id ? stOf({ status: p.status, published_at: p.published_at }) : 'draft', s = ST[st];
    const pill = $('[data-st]', ed); pill.className = `pill ${s[0]}`; pill.textContent = id ? s[1] + (dirty ? ' · kaydedilmedi' : '') : 'Yeni yazı' + (dirty ? ' · kaydedilmedi' : '');
    $('[data-act="publish"]', ed).innerHTML = p.status === 'published' ? '<i class="ico ico-x"></i>Yayından kaldır' : '<i class="ico ico-send"></i>Yayınla';
    const v = $('[data-view]', ed); v.hidden = !(id && p.status === 'published'); v.href = `${site}/blog/${p.slug}`;
  };
  const coverBox = () => { const b = $('[data-cover]', ed); b.style.backgroundImage = cover ? `url('${IMG(cover)}')` : ''; b.textContent = cover ? '' : 'Kapak görseli yok'; $('[data-act="nocover"]', ed).hidden = !cover; };
  const gallery = () => render($('[data-gal]', ed), images.length ? html`${images.map((m) => html`<div class="bl-gi" style="background-image:url('${IMG(m.id)}')" title="${m.name} · ${m.w}×${m.h} · ${Math.round(m.size / 1024)} KB">
      <div class="acts"><button type="button" data-gi="ins" data-id="${m.id}">Ekle</button><button type="button" data-gi="cover" data-id="${m.id}">Kapak</button><button type="button" data-gi="del" data-id="${m.id}" title="Sil">✕</button></div></div>`)}`
    : html`<div class="tiny muted">Görsel yok. Araç çubuğundaki <b>Görsel</b> düğmesiyle, sürükle-bırak ya da Ctrl+V ile ekleyin.</div>`);
  const setMode = (m) => { mode = m; $$('[data-mode]', ed).forEach((b) => b.classList.toggle('on', b.dataset.mode === m)); $('[data-split]', ed).classList.toggle('both', m === 'both'); $('[data-wr]', ed).hidden = m === 'preview'; $('[data-pv]', ed).hidden = m === 'write'; if (m !== 'write') preview(); };
  const touch = () => { if (!dirty) { dirty = true; status(); } };

  // İmlecin olduğu yere metin ekle / seçimi sar
  const insert = (before, after = '', ph = '') => {
    const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e) || ph;
    ta.setRangeText(before + sel + after, s, e, 'end');
    if (!ta.value.slice(s, e) && ph) ta.setSelectionRange(s + before.length, s + before.length + sel.length);
    ta.focus(); ta.dispatchEvent(new Event('input'));
  };
  const block = (text) => { const s = ta.selectionStart, pre = ta.value.slice(0, s), nl = !pre || pre.endsWith('\n\n') ? '' : pre.endsWith('\n') ? '\n' : '\n\n'; ta.setRangeText(nl + text + '\n\n', s, ta.selectionEnd, 'end'); ta.focus(); ta.dispatchEvent(new Event('input')); };
  const linePrefix = (pfx) => {
    const s = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1, e0 = ta.value.indexOf('\n', ta.selectionEnd), e = e0 < 0 ? ta.value.length : e0;
    const lines = ta.value.slice(s, e).split('\n').map((l, i) => (typeof pfx === 'function' ? pfx(i) : pfx) + l.replace(/^(#{1,4}\s+|[-*+]\s+|\d+\.\s+|>\s?)/, ''));
    ta.setRangeText(lines.join('\n'), s, e, 'end'); ta.focus(); ta.dispatchEvent(new Event('input'));
  };
  const TOOL = {
    h2: () => linePrefix('## '), h3: () => linePrefix('### '), b: () => insert('**', '**', 'kalın yazı'), i: () => insert('*', '*', 'eğik yazı'),
    link: () => { const u = prompt('Bağlantı adresi (https://… ya da /paketler gibi site içi adres)', 'https://'); if (u && u !== 'https://') insert('[', `](${u.trim()})`, 'bağlantı yazısı'); },
    ul: () => linePrefix('- '), ol: () => linePrefix((i) => `${i + 1}. `), quote: () => linePrefix('> '), hr: () => block('---'),
    table: () => block('| Başlık 1 | Başlık 2 |\n| --- | --- |\n| Hücre | Hücre |'),
    img: async () => upload(await pickFiles(), true),
  };
  // Görsel yükle; ins = yazıya ekle, asCover = kapak yap
  async function upload(files, ins = false, asCover = false) {
    for (const file of files) {
      try {
        toast(`${file.name || 'Görsel'} küçültülüp yükleniyor…`);
        const s = await shrink(file);
        const r = await api('blog/images', { method: 'POST', body: { data: s.data, name: file.name || 'gorsel', w: s.w, h: s.h, post_id: id || null } });
        images.push({ id: r.id, name: file.name || 'gorsel', w: r.w, h: r.h, size: r.size });
        if (asCover) { cover = r.id; coverBox(); }
        if (ins) block(`![${altOf(file.name)}](img:${r.id})`);
        touch(); gallery(); preview();
      } catch (e) { toast(e.message, true); }
    }
  }
  const values = (status) => ({ title: F('title').value.trim(), slug: slugTouched ? F('slug').value.trim() : '', summary: F('summary').value.trim(), body: ta.value, cover_id: cover || '',
    tags: F('tags').value, author: F('author').value.trim(), seo_title: F('seo_title').value.trim(), seo_desc: F('seo_desc').value.trim(),
    published_at: F('published_at').value ? new Date(F('published_at').value).getTime() : status === 'published' ? null : p.published_at || null, status, ...(id ? { updated_at: updatedAt } : {}) });
  async function save(st = p.status) {
    const v = values(st);
    if (v.title.length < 3) { F('title').focus(); throw new Error('Başlık yazın (en az 3 karakter)'); }
    if (!id) {
      const r = await api('blog', { method: 'POST', body: v });
      dirty = false; toast(st === 'published' ? 'Yazı yayınlandı' : 'Taslak kaydedildi');
      location.hash = `#/blog/${r.id}`;
      return;
    }
    const r = await api(`blog/${id}`, { method: 'PUT', body: v });
    Object.assign(p, { status: r.status, published_at: r.published_at, slug: r.slug }); updatedAt = r.updated_at;
    F('slug').value = r.slug; F('published_at').value = dtLocal(r.published_at); slugTouched = true; dirty = false; status(); meta();
    toast(st === 'published' ? (r.published_at > Date.now() ? `Kaydedildi · yazı ${dateTime(r.published_at)} tarihinde yayınlanacak` : 'Kaydedildi · yazı yayında (site birkaç dakikada güncellenir)') : 'Taslak kaydedildi');
  }

  // Olaylar
  ed.addEventListener('input', (e) => {
    const n = e.target.name;
    if (!n) return;
    touch();
    if (n === 'slug') slugTouched = !!e.target.value.trim();
    if (n === 'title' && !slugTouched) F('slug').value = slugify(e.target.value);
    meta();
    if (mode !== 'write' && ['body', 'title', 'summary'].includes(n)) schedulePreview();
  });
  const schedulePreview = debounce(preview, 200);
  F('slug').addEventListener('change', (e) => { e.target.value = slugify(e.target.value); slugTouched = !!e.target.value; meta(); });
  $('.bl-tools', ed).addEventListener('click', (e) => { const b = e.target.closest('[data-tool]'); if (b) TOOL[b.dataset.tool](); });
  $('.seg', ed).addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
  ta.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase(); if (k === 'b' || k === 'i' || k === 'k') { e.preventDefault(); TOOL[k === 'k' ? 'link' : k](); }
  });
  ta.addEventListener('paste', (e) => { const fs = [...((e.clipboardData || {}).items || [])].filter((x) => x.kind === 'file').map((x) => x.getAsFile()).filter(Boolean); if (fs.length) { e.preventDefault(); upload(fs, true); } });
  ta.addEventListener('dragover', (e) => { e.preventDefault(); ta.classList.add('bl-drop'); });
  ta.addEventListener('dragleave', () => ta.classList.remove('bl-drop'));
  ta.addEventListener('drop', (e) => { const fs = [...((e.dataTransfer || {}).files || [])]; ta.classList.remove('bl-drop'); if (fs.length) { e.preventDefault(); upload(fs, true); } });
  $('[data-gal]', ed).addEventListener('click', async (e) => {
    const b = e.target.closest('[data-gi]'); if (!b) return;
    const gid = b.dataset.id, m = images.find((x) => x.id === gid);
    if (b.dataset.gi === 'ins') block(`![${altOf(m && m.name)}](img:${gid})`);
    if (b.dataset.gi === 'cover') { cover = gid; coverBox(); touch(); preview(); }
    if (b.dataset.gi === 'del') {
      if (ta.value.includes(`img:${gid}`) || cover === gid) return toast('Bu görsel yazıda ya da kapakta kullanılıyor; önce çıkarın', true);
      if (!(await confirmBox('Görsel silinsin mi?', 'Sil'))) return;
      await busy(b, async () => { await api(`blog/images/${gid}`, { method: 'DELETE' }); images.splice(images.indexOf(m), 1); gallery(); });
    }
  });
  const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); busy($('[data-act="save"]', ed), () => save()); } };
  const onLeave = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  document.addEventListener('keydown', onKey);
  window.addEventListener('beforeunload', onLeave);
  actions(ed, {
    back: async () => { if (!dirty || (await confirmBox('Kaydedilmemiş değişiklikler var. Kaydetmeden çıkılsın mı?', 'Kaydetmeden çık'))) { dirty = false; location.hash = '#/blog'; } },
    save: (b) => busy(b, () => save()),
    publish: (b) => busy(b, async () => {
      if (p.status === 'published' && !(await confirmBox('Yazı yayından kaldırılsın mı? Sitede birkaç dakika içinde görünmez olur; taslak olarak kalır.', 'Yayından kaldır'))) return;
      await save(p.status === 'published' ? 'draft' : 'published');
    }),
    cover: async () => upload(await pickFiles(false), false, true),
    nocover: () => { cover = null; coverBox(); touch(); preview(); },
    upload: async () => upload(await pickFiles()),
    del: (b) => busy(b, async () => {
      if (!(await confirmBox(`"${p.title}" yazısı ve görselleri kalıcı olarak silinsin mi?${p.status === 'published' ? ' Yazı sitede de kaldırılır.' : ''}`, 'Sil'))) return;
      await api(`blog/${id}`, { method: 'DELETE' }); dirty = false; toast('Yazı silindi'); location.hash = '#/blog';
    }),
  });
  setMode(mode); status(); meta(); coverBox(); gallery(); preview();
  if (!id) F('title').focus();
  return { destroy: () => { document.removeEventListener('keydown', onKey); window.removeEventListener('beforeunload', onLeave); } };
}
