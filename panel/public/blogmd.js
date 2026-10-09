// Blog yazı biçimi: Markdown'ın küçük ve güvenli bir alt kümesi → HTML. Panel (önizleme) ve sunucu (sitede yayın, bkz. src/blog.js) aynı kodu kullanır.
// Ham HTML yazılamaz: her karakter önce kaçışlanır, sonra yalnız aşağıdaki biçimler etikete dönüşür (betik / olay özniteliği eklenemez).
//   ## Başlık · ### Alt başlık · **kalın** · *eğik* · ~~üstü çizili~~ · `kod` · [bağlantı](https://…) · ![açıklama](img:kimlik "alt yazı")
//   - madde · 1. sıralı madde · > alıntı · --- (ayırıcı çizgi) · ``` kod bloğu ``` · | tablo | satırı |
// Bağlantılar yalnız http(s), mailto, tel, site içi (/…) ve sayfa içi (#…) adresler; görseller yalnız blog görselleri (img:kimlik) ve https.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const IMG_ID = /^[a-f0-9]{16,32}$/;

// Türkçe karakterleri koruyarak adres (slug) üretir: "Kargo Ücreti Nasıl Hesaplanır?" → "kargo-ucreti-nasil-hesaplanir"
const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
export function slugify(s, max = 80) {
  const x = String(s ?? '').replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => TR[c]).replace(/&/g, ' ve ')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return x.length <= max ? x : x.slice(0, max).replace(/-[^-]*$/, '') || x.slice(0, max);
}

// Adres güvenli mi (kaçışlanmış metin üzerinde): javascript:, data: gibi şemalar reddedilir
const safeHref = (u) => /^(https?:\/\/|mailto:|tel:|\/(?![/\\])|#)/i.test(u);

// Satır içi biçimler (girdi kaçışlanmış metindir)
function inline(s, o, keep) {
  const put = (h) => { keep.push(h); return `\u0000${keep.length - 1}\u0000`; };
  s = s.replace(/`([^`\n]+)`/g, (_, c) => put(`<code>${c}</code>`));
  s = s.replace(/!\[([^\]\n]*)\]\(\s*([^\s)]+)(?:\s+&quot;(.*?)&quot;)?\s*\)/g, (m, alt, src, title) => { const im = imgTag(src, alt, title, o); return im ? put(im) : ''; });
  s = s.replace(/\[([^\]\n]+)\]\(\s*([^\s)]+)\s*\)/g, (m, text, href) => {
    if (!safeHref(href)) return put(emph(text));
    const ext = /^https?:\/\//i.test(href) && !(o.site && href.startsWith(o.site));
    return put(`<a href="${href}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${emph(text)}</a>`);
  });
  s = emph(s);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)]);
}
const emph = (s) => s.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '<strong>$1</strong>').replace(/~~(?=\S)([^~\n]*?\S)~~/g, '<del>$1</del>')
  .replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?![*\w])/g, '$1<em>$2</em>').replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1<em>$2</em>');

// Görsel: img:kimlik → blog görsel adresi (o.image(kimlik) → { src, w, h }); https adresleri olduğu gibi
function imgTag(src, alt, title, o) {
  let u = src, w = 0, h = 0;
  const m = /^img:([a-f0-9]{16,32})$/.exec(src);
  if (m) { const r = o.image(m[1]); if (!r) return ''; u = typeof r === 'string' ? r : r.src; w = r.w || 0; h = r.h || 0; }
  else if (!/^https:\/\//i.test(src)) return '';
  return `<img src="${u}" alt="${alt}"${title ? ` title="${title}"` : ''}${w && h ? ` width="${w}" height="${h}"` : ''} loading="lazy" decoding="async">`;
}

// o: { image(id) → adres | {src,w,h}, site: kendi site adresi (bağlantı yeni sekmede açılmasın) }
export function mdToHtml(src, opts = {}) {
  const o = { image: (id) => `/api/public/blog/img/${id}`, site: '', ...opts };
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [], ids = new Map();
  let para = [];
  const keep = [];
  const il = (s) => inline(esc(s), o, keep);
  const flush = () => { if (para.length) { out.push(`<p>${para.map(il).join('<br>')}</p>`); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i], t = ln.trim();
    let m;
    if (/^```/.test(t)) {
      flush();
      const code = [];
      while (++i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    if (!t) { flush(); continue; }
    if ((m = /^(#{1,4})\s+(.+?)\s*#*$/.exec(t))) {
      flush();
      const lv = Math.min(4, Math.max(2, m[1].length)), base = slugify(m[2], 60) || 'bolum', n = (ids.get(base) || 0) + 1;
      ids.set(base, n);
      out.push(`<h${lv} id="${n > 1 ? `${base}-${n}` : base}">${il(m[2])}</h${lv}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); out.push('<hr>'); continue; }
    // Tek başına görsel → figür (alt yazıyla)
    if ((m = /^!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+"(.*?)")?\s*\)$/.exec(t))) {
      flush();
      const im = imgTag(esc(m[2]), esc(m[1]), '', o);
      if (im) out.push(`<figure>${im}${m[3] ? `<figcaption>${il(m[3])}</figcaption>` : ''}</figure>`);
      continue;
    }
    if (/^>/.test(t)) {
      flush();
      const q = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) q.push(lines[i].trim().replace(/^>\s?/, ''));
      i--;
      out.push(`<blockquote><p>${q.map(il).join('<br>')}</p></blockquote>`);
      continue;
    }
    if (/^([-*+]|\d{1,3}[.)])\s+/.test(t)) {
      flush();
      const ol = /^\d/.test(t), items = [];
      for (; i < lines.length; i++) {
        const x = lines[i].trim();
        if ((m = (ol ? /^\d{1,3}[.)]\s+(.*)$/ : /^[-*+]\s+(.*)$/).exec(x))) items.push(m[1]);
        else if (x && items.length && /^\s{2,}\S/.test(lines[i])) items[items.length - 1] += '\n' + x; // girintili devam satırı
        else break;
      }
      i--;
      out.push(`<${ol ? 'ol' : 'ul'}>${items.map((x) => `<li>${x.split('\n').map(il).join('<br>')}</li>`).join('')}</${ol ? 'ol' : 'ul'}>`);
      continue;
    }
    // Tablo: | a | b | satırı ve altında | --- | --- | ayırıcısı
    if (/^\|.*\|$/.test(t) && i + 1 < lines.length && /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(lines[i + 1].trim())) {
      flush();
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(t), rows = [];
      for (i += 2; i < lines.length && /^\|.*\|$/.test(lines[i].trim()); i++) rows.push(cells(lines[i]));
      i--;
      out.push(`<div class="tbl"><table><thead><tr>${head.map((c) => `<th>${il(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${head.map((_, k) => `<td>${il(r[k] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    para.push(t);
  }
  flush();
  return out.join('\n');
}

// Düz metin (özet, okuma süresi, arama motoru açıklaması için)
export const mdText = (src) => String(src ?? '').replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d{1,3}[.)])\s+/gm, '').replace(/^\s*\|?(\s*:?-{2,}:?\s*\|?)+\s*$/gm, ' ').replace(/\*{1,2}|~~|`|\|/g, ' ').replace(/^-{3,}$/gm, ' ').replace(/\s+/g, ' ').trim();
export const readMinutes = (src) => Math.max(1, Math.round(mdText(src).split(' ').filter(Boolean).length / 200));
// Yazıda kullanılan blog görselleri (img:kimlik)
export const imageIds = (src) => [...new Set([...String(src ?? '').matchAll(/\]\(\s*img:([a-f0-9]{16,32})/g)].map((m) => m[1]))];
