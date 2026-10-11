// Araç sayfaları: /araclar, /araclar/<slug> ve (resmî liste varsa) /araclar/<pazaryeri>-komisyon-oranlari. build.mjs çağırır.
// İçerik src/tools.mjs'ten; kategori listeleri src/commission.mjs'ten. Sayfalar tamamen statik HTML'dir: rehber metni ve oran tabloları
// derlemede yazılır, tools.js yalnız hesaplayıcıyı ve tablo içi aramayı çalıştırır (içerik için betik gerekmez).
import { TOOLS, TOOL_GROUPS, UPDATED, YEAR, calcForm, miniProfit } from './tools.mjs';
import { MARKETPLACES, GEN, groupByTop, charged, trDate, slugify } from './commission.mjs';

const BRAND = ' | Hastürk CRM';
const R = (v, c) => (typeof v === 'function' ? v(c) : v);
const pct = (n) => `%${(Math.round(n * 100) / 100).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}`;

export function makeToolPages({ esc, ico, tick, faqHtml, toolIc, channels, comm, siteUrl }) {
  const tById = Object.fromEntries(TOOLS.map((t) => [t.slug, t]));
  // srcs: tools.js'e verilen resmî liste bilgileri
  const srcs = Object.fromEntries(Object.entries(comm).map(([mp, d]) => [mp, { src: d.src, name: MARKETPLACES[mp], date: trDate(d.published), basis: d.basis, count: d.cats.length, page: `/araclar/${mp}-komisyon-oranlari` }]));
  const ctxOf = (t) => { const d = t.mp ? comm[t.mp] : null; return { data: d, dateText: d ? trDate(d.published) : '' }; };
  const title = (s, where) => { if (s.length > 60) throw new Error(`${where}: başlık ${s.length} karakter (en çok 60): ${s}`); return (s + BRAND).length <= 60 ? s + BRAND : s; };
  const desc = (s, where) => { if (s.length > 155) throw new Error(`${where}: açıklama ${s.length} karakter (en çok 155)`); return s; };
  // Rehber metni: **kalın**, [bağlantı](/adres)
  const fmt = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, '<a href="$2">$1</a>');
  const table = ({ cap, head, rows, num }) => `<div class="tw"><table class="gt${num ? ' num' : ''}">${cap ? `<caption>${esc(cap)}</caption>` : ''}<thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td>${fmt(c)}</td>` : `<th scope="row">${fmt(c)}</th>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
  const block = ([k, v]) => ({
    h2: () => `<h2 id="${slugify(v)}">${esc(v)}</h2>`, h3: () => `<h3>${esc(v)}</h3>`, p: () => `<p>${fmt(v)}</p>`,
    ul: () => `<ul>${v.map((x) => `<li>${fmt(x)}</li>`).join('')}</ul>`, ol: () => `<ol>${v.map((x) => `<li>${fmt(x)}</li>`).join('')}</ol>`,
    table: () => table(v), note: () => `<p class="g-note">${ico('i-eye')}<span>${fmt(v)}</span></p>`,
  })[k]();
  const updated = `<time datetime="${UPDATED}">${trDate(UPDATED)}</time>`;
  const srcLine = (mp) => { const s = srcs[mp]; return s ? `<a href="${esc(comm[mp].source)}" rel="nofollow noopener" target="_blank">${esc(s.name)} resmî komisyon listesi</a>, ${esc(s.date)} · <a href="${s.page}">tüm oranlar</a>` : ''; };

  const toolCard = (t) => `<a class="fcard tcard reveal" href="/araclar/${t.slug}">${toolIc(t)}<b>${esc(t.name)}</b><span>${esc(t.card)}</span><em>Hesapla ${ico('i-arrow')}</em></a>`;
  const TOOLS_JS = '<!-- head --><script src="/assets/tools.js?v={{v:tools.js}}" defer></script><!-- /head -->';
  const toolCta = `<section class="sec"><div class="wrap"><div class="ask big reveal"><div><b>Bu hesabı her sipariş için otomatik yapın</b><span>Hastürk CRM, pazaryerinin kestiği komisyon, kargo ve hizmet bedeli kayıtlarıyla her siparişin net kârını kendiliğinden hesaplar. Kurulum ücreti yok.</span></div>
  <div class="ctas"><a class="btn btn-primary" href="/demo#deneme">7 gün ücretsiz deneyin ${ico('i-arrow')}</a><a class="btn btn-line" data-demo href="/demo">Canlı demo</a></div></div></div></section>`;
  const crumbs = (items) => `<nav class="crumbs" aria-label="Konum">${items.map(([h, l], i) => (i < items.length - 1 ? `<a href="${h}">${esc(l)}</a><span>›</span>` : `<b>${esc(l)}</b>`)).join('')}</nav>`;
  const webApp = (url, name, d) => ({ '@type': 'WebApplication', '@id': `${url}#app`, name, url, description: d, applicationCategory: 'FinanceApplication', operatingSystem: 'Web', browserRequirements: 'JavaScript', inLanguage: 'tr-TR',
    isAccessibleForFree: true, offers: { '@type': 'Offer', price: 0, priceCurrency: 'TRY' }, publisher: { '@id': `${siteUrl}/#org` } });

  function toolPage(t) {
    const c = ctxOf(t), url = `${siteUrl}/araclar/${t.slug}`;
    if (t.related.some((s) => !tById[s])) throw new Error(`${t.slug}: ilgili araç bulunamadı`);
    const rel = t.related.map((s) => tById[s]);
    const guide = R(t.guide, c) || [], faq = R(t.faq, c);
    const h2s = guide.filter(([k]) => k === 'h2').map(([, v]) => v);
    const name = t.name.replace(/^./, (x) => x.toLocaleUpperCase('tr'));
    const mp = t.mp || '';
    const body = `${TOOLS_JS}<section class="page-hero fp-hero tool-hero">
  <div class="wrap">
    ${crumbs([['/', 'Ana sayfa'], ['/araclar', 'Araçlar'], ['', name]])}
    <div class="tool-head"><div class="fp-k">${toolIc(t)}Ücretsiz hesaplama aracı</div>
      <h1>${esc(t.h1[0])} <span class="grad">${esc(t.h1[1])}</span></h1>
      <p>${esc(R(t.lead, c))}</p>
      <div class="checks"><span>${tick}Ücretsiz, kayıt gerekmez</span><span>${tick}Tutarlar KDV dahil</span><span>${tick}Veriler tarayıcınızda kalır</span></div></div>
    ${calcForm(t, channels, t.mp ? (srcs[t.mp] ? { [t.mp]: srcs[t.mp] } : {}) : srcs)}
    <p class="tool-meta">${mp && srcs[mp] ? `<span>${ico('i-shield')}Kaynak: ${srcLine(mp)}</span>` : mp ? `<span>${ico('i-eye')}${esc(MARKETPLACES[mp])} kategori oranını satıcı panelinizden girin; oran KDV hariçse araç KDV'yi ekler.</span>` : ''}<span>${ico('i-calendar')}Son güncelleme: ${updated}</span></p>
    <p class="tool-cta"><a href="/demo#deneme">Bu hesabı her sipariş için otomatik yapın ${ico('i-arrow')} <b>7 gün ücretsiz deneyin</b></a></p>
  </div>
</section>
<section class="sec tool-guide">
  <div class="wrap tg">
    <aside class="tg-side">
      <nav class="tg-toc" aria-label="Bu sayfada"><b>Bu sayfada</b><ol><li><a href="#formul">Formül</a></li>${h2s.map((h) => `<li><a href="#${slugify(h)}">${esc(h)}</a></li>`).join('')}<li><a href="#sss">Sık sorulanlar</a></li></ol></nav>
      ${mp && srcs[mp] ? `<a class="tg-rates" href="${srcs[mp].page}">${ico('i-list')}<span><b>${esc(MARKETPLACES[mp])} komisyon oranları</b><small>${srcs[mp].count} kategorinin resmî oranı</small></span></a>` : ''}
      <div class="tg-links"><b>İlgili sayfalar</b>${(t.links || []).map(([h, l, s]) => `<a href="${h}"><span>${esc(l)}</span><small>${esc(s)}</small></a>`).join('')}</div>
    </aside>
    <article class="tg-body">
      <h2 id="formul">Hesaplama formülü</h2>
      <div class="formula">${t.formula.map((f) => `<code>${esc(f)}</code>`).join('')}</div>
      ${guide.map(block).join('\n      ')}
      <p class="tg-upd">${ico('i-calendar')}Son güncelleme: ${updated}. Bu sayfadaki hesaplar bilgi amaçlıdır; vergi ve muhasebe kararları için mali müşavirinize danışın.</p>
    </article>
  </div>
</section>
<section class="sec alt" id="sss">
  <div class="wrap"><div class="sec-head reveal"><div class="kicker">Sık sorulanlar</div><h2>${esc(t.h1.join(' '))} Hakkında</h2></div>${faqHtml(faq)}</div>
</section>
<section class="sec">
  <div class="wrap"><div class="sec-head reveal"><div class="kicker">Diğer araçlar</div><h2>Bunlar da İşinize Yarar</h2></div>
    <div class="fcards tcards">${rel.map(toolCard).join('')}</div>
    <div class="center-cta"><a class="btn btn-line" href="/araclar">Tüm araçlar ${ico('i-arrow')}</a></div></div>
</section>
${toolCta}`;
    const d = desc(R(t.desc, c), t.slug);
    const ld = [webApp(url, name, d)];
    if (t.howto) ld.push({ '@type': 'HowTo', '@id': `${url}#howto`, name: `${t.h1.join(' ')} nasıl yapılır?`, inLanguage: 'tr-TR', totalTime: 'PT1M', tool: [{ '@type': 'HowToTool', name: `${name} aracı` }],
      step: t.howto.map(([n, x], i) => ({ '@type': 'HowToStep', position: i + 1, name: n, text: x, url: `${url}#formul` })) });
    return { meta: { title: title(R(t.title, c), t.slug), crumb: name, description: d, url: `/araclar/${t.slug}`, nav: 'araclar', modified: UPDATED, ld }, body, file: `araclar/${t.slug}.html` };
  }

  // Resmî oran tablosu sayfası (statik HTML; ana kategoriye göre gruplu, çapalı)
  function ratePage(mp) {
    const d = comm[mp], n = MARKETPLACES[mp], ng = n + GEN[mp], groups = groupByTop(d), url = `${siteUrl}/araclar/${mp}-komisyon-oranlari`;
    const calc = TOOLS.find((t) => t.mp === mp), date = trDate(d.published), ex = d.basis === 'kdv-haric';
    const all = d.cats.map(([, r]) => r), lo = Math.min(...all), hi = Math.max(...all);
    const faq = [
      [`${n} komisyon oranları KDV dahil mi?`, ex ? `Hayır. ${ng} resmî listesindeki oranlar KDV hariçtir; komisyon faturasına %20 KDV eklenir. Tablodaki "Kesilen (KDV dahil)" sütunu cebinizden çıkan oranı gösterir.` : `Listede oranlar KDV dahil yayımlanmıştır; tablodaki iki sütun aynıdır.`],
      [`${n} komisyon oranları hangi tarihte yayımlandı?`, `Bu sayfadaki oranlar ${ng} ${date} tarihli resmî komisyon listesinden alınmıştır. ${n} oranları dönemsel olarak güncelleyebilir; mağazanıza özel oranı satıcı panelinizden kontrol edin.`],
      [`${n} komisyonu nasıl hesaplanır?`, `Satış fiyatı (KDV dahil) × kategori oranı${ex ? ' × 1,20 (KDV)' : ''}. Kargo, hizmet bedeli ve %1 stopajla birlikte net kârınızı ${n} komisyon hesaplama aracında görebilirsiniz.`],
      [`En düşük ve en yüksek ${n} komisyon oranı kaç?`, `Listede ${d.cats.length} kategori var; oranlar ${pct(lo)} ile ${pct(hi)} arasında (KDV ${ex ? 'hariç' : 'dahil'}).`],
      ['Kategorimi listede bulamıyorum, ne yapmalıyım?', 'Sayfanın üstündeki arama kutusuna ürün türünü yazın; alt kategori adları da aranır. Bulamazsanız satıcı panelinizde ürünün kategorisindeki oranı kontrol edin ve hesaplayıcıya elle girin.'],
    ];
    const body = `${TOOLS_JS}<section class="page-hero fp-hero tool-hero rate-hero">
  <div class="wrap">
    ${crumbs([['/', 'Ana sayfa'], ['/araclar', 'Araçlar'], ['', `${n} komisyon oranları`]])}
    <div class="tool-head"><div class="fp-k">${toolIc(calc || { icon: 'i-list', color: 'c-blue' })}Resmî liste · ${d.cats.length} kategori</div>
      <h1>${esc(n)} Komisyon Oranları <span class="grad">${YEAR}</span></h1>
      <p>${esc(ng)} yayımladığı resmî kategori komisyon listesi: ${d.cats.length} kategori, ${groups.length} ana kategori altında. Oranlar ${ex ? 'KDV hariçtir; yanındaki sütun %20 KDV eklenmiş, cebinizden çıkan oranı' : 'KDV dahildir'} gösterir.</p></div>
    <div class="rate-src"><div>${ico('i-shield')}<span><b>Kaynak:</b> <a href="${esc(d.source)}" rel="nofollow noopener" target="_blank">${esc(d.sourceTitle || `${n} komisyon listesi`)}</a><small>Liste tarihi: ${esc(date)} · Sitemize aktarıldı: ${esc(trDate(d.retrieved))}${d.note ? ` · ${esc(d.note)}` : ''}</small></span></div>
      ${calc ? `<a class="btn btn-primary" href="/araclar/${calc.slug}">Kategorinizle hesaplayın ${ico('i-arrow')}</a>` : ''}</div>
    <div class="rt-find"><label class="cf-l" for="rt-q">Kategori arayın</label><div class="cp-box">${ico('i-search')}<input id="rt-q" class="in" type="search" data-rt-q autocomplete="off" placeholder="ör. tencere, telefon kılıfı, mont"></div><p class="cp-st" data-rt-st aria-live="polite"></p></div>
    <nav class="rt-jump" aria-label="Ana kategoriler">${groups.map((g) => `<a href="#${g.id}">${esc(g.top)} <small>${g.min === g.max ? pct(g.min) : `${pct(g.min)}–${pct(g.max)}`}</small></a>`).join('')}</nav>
  </div>
</section>
<section class="sec rate-sec">
  <div class="wrap" data-rt>
    ${groups.map((g) => `<section class="rt-g" id="${g.id}" data-rt-g><h2>${esc(g.top)} <small>${g.rows.length} kategori · ${g.min === g.max ? pct(g.min) : `${pct(g.min)}–${pct(g.max)}`}</small></h2>
    <div class="tw"><table class="gt num rt"><thead><tr><th scope="col">Kategori</th><th scope="col">Resmî oran${ex ? ' (KDV hariç)' : ''}</th>${ex ? '<th scope="col">Kesilen (KDV dahil)</th>' : ''}<th scope="col"><span class="vh">Hesapla</span></th></tr></thead><tbody>${g.rows.map(([sub, r, path]) => `<tr data-q="${esc(path)}"><th scope="row">${esc(sub)}</th><td>${pct(r)}</td>${ex ? `<td>${pct(charged(r, d.basis))}</td>` : ''}<td>${calc ? `<a href="/araclar/${calc.slug}?kat=${encodeURIComponent(path)}" aria-label="${esc(sub)} için hesapla">Hesapla</a>` : ''}</td></tr>`).join('')}</tbody></table></div>
    <p class="rt-top"><a href="#rt-q">Başa dön ↑</a></p></section>`).join('\n    ')}
    <p class="tg-upd">${ico('i-calendar')}Oranlar ${esc(ng)} ${esc(date)} tarihli resmî listesinden alınmıştır. Mağazanıza özel anlaşma, kampanya ya da dönemsel indirimler oranı değiştirebilir; kesin oran için satıcı panelinize bakın.</p>
  </div>
</section>
<section class="sec alt"><div class="wrap"><div class="sec-head reveal"><div class="kicker">Sık sorulanlar</div><h2>${esc(n)} Komisyon Oranları Hakkında</h2></div>${faqHtml(faq)}</div></section>
${toolCta}`;
    const t = `${n} Komisyon Oranları ${YEAR}: Kategori Bazlı Liste`;
    const dsc = desc(`${n} komisyon oranları ${YEAR}: ${d.cats.length} kategorinin resmî oranı, KDV hariç ve KDV dahil haliyle. Kategorinizi arayın, tek tıkla hesaplayın.`.slice(0, 155), `${mp}-komisyon-oranlari`);
    const ld = [{ '@type': 'Dataset', '@id': `${url}#data`, name: `${n} kategori komisyon oranları`, description: dsc, inLanguage: 'tr-TR', url, isBasedOn: d.source, dateModified: d.retrieved, temporalCoverage: `${d.published}/..`,
      creator: { '@type': 'Organization', name: n }, publisher: { '@id': `${siteUrl}/#org` }, isAccessibleForFree: true,
      variableMeasured: [{ '@type': 'PropertyValue', name: `Komisyon oranı (${ex ? 'KDV hariç' : 'KDV dahil'})`, unitText: 'yüzde' }] }];
    return { meta: { title: title(t, mp), crumb: `${n} komisyon oranları`, description: dsc, url: `/araclar/${mp}-komisyon-oranlari`, nav: 'araclar', modified: d.retrieved, ld }, body, file: `araclar/${mp}-komisyon-oranlari.html` };
  }

  function toolsIndex() {
    const rates = Object.keys(comm);
    const body = `${TOOLS_JS}<section class="page-hero">
  <div class="wrap">
    <nav class="crumbs center" aria-label="Konum"><a href="/">Ana sayfa</a><span>›</span><b>Araçlar</b></nav>
    <div class="kicker">${TOOLS.length} ücretsiz araç</div>
    <h1>Ücretsiz E-Ticaret <span class="grad">Hesaplama Araçları</span></h1>
    <p>Trendyol, Hepsiburada ve N11 komisyonu, KDV, desi, yüzde, satış fiyatı, stopaj ve kâr hesapları. Kayıt gerekmez, tarayıcınızda çalışır; girdiğiniz rakamlar hiçbir yere gönderilmez.</p>
    <div class="jump"><a href="#pazaryeri">Komisyon ve kâr</a><a href="#genel">Genel hesaplayıcılar</a>${rates.length ? '<a href="#oranlar">Komisyon oranları</a>' : ''}<a href="#hizli">Hızlı net kâr</a></div>
  </div>
</section>
${[...TOOL_GROUPS].reverse().map(([g, h], i) => `<section id="${g}" class="sec${i ? ' alt' : ''}"><div class="wrap">
  <div class="sec-head reveal"><div class="kicker">${esc(h)}</div><h2>${g === 'genel' ? 'Fiyat, Vergi ve Kargo Hesapları' : 'Pazaryeri Komisyonu ve Kâr'}</h2><p>${g === 'pazaryeri' ? 'Komisyon oranını pazaryerinin gösterdiği gibi KDV hariç girin; araç %20 KDV\'yi ekler, kargo, hizmet bedeli ve stopajla net kârınızı hesaplar.' : 'Satış fiyatını hedef marjdan bulun, KDV ve stopajı ayırın, kargo desisini hesaplayın.'}</p></div>
  <div class="fcards tcards">${TOOLS.filter((t) => t.group === g).map(toolCard).join('')}</div>
</div></section>`).join('\n')}
${rates.length ? `<section id="oranlar" class="sec"><div class="wrap"><div class="sec-head reveal"><div class="kicker">Resmî listeler</div><h2>Kategori Bazlı Komisyon Oranları</h2></div>
  <div class="fcards tcards">${rates.map((mp) => { const tt = TOOLS.find((x) => x.mp === mp); return `<a class="fcard tcard reveal" href="/araclar/${mp}-komisyon-oranlari">${toolIc(tt || { icon: 'i-list', color: 'c-blue' })}<b>${esc(MARKETPLACES[mp])} komisyon oranları</b><span>${comm[mp].cats.length} kategorinin resmî oranı (${esc(trDate(comm[mp].published))}).</span><em>Listeyi açın ${ico('i-arrow')}</em></a>`; }).join('')}</div></div></section>` : ''}
<section id="hizli" class="sec${rates.length ? ' alt' : ''}">
  <div class="wrap">
    <div class="sec-head reveal"><div class="kicker">Hemen deneyin</div><h2>Hızlı Net Kâr Hesabı</h2><p>Satış fiyatı, alış maliyeti, komisyon ve kargoyu girin; ürün başı kârınızı görün. Tüm tutarlar KDV dahildir.</p></div>
    <div class="mini-wrap reveal">${miniProfit()}</div>
  </div>
</section>
<section class="sec${rates.length ? '' : ' alt'}">
  <div class="wrap"><div class="sec-head reveal"><div class="kicker">Sık sorulanlar</div><h2>Araçlar Hakkında</h2></div>${faqHtml([
    ['Araçlar ücretsiz mi?', 'Evet. Tüm hesaplama araçları ücretsizdir; kayıt ya da giriş gerekmez.'],
    ['Girdiğim rakamlar kaydediliyor mu?', 'Hayır. Hesaplar tamamen tarayıcınızda yapılır; girdiğiniz tutarlar sunucuya gönderilmez ve saklanmaz. "Bağlantıyı kopyala" derseniz değerler yalnız bağlantının içinde bulunur.'],
    ['Tutarları KDV dahil mi girmeliyim?', 'Evet. Satış fiyatı, kargo, hizmet bedeli ve alış maliyetini faturada yazan, cebinizden çıkan KDV dahil haliyle girin. Komisyon oranını ise pazaryerinin gösterdiği gibi KDV hariç girebilirsiniz; araç %20 KDV\'yi ekler.'],
    ['Komisyon oranları nereden geliyor?', rates.length ? `${rates.map((mp) => MARKETPLACES[mp]).join(', ')} için oranlar pazaryerinin yayımladığı resmî kategori listesinden gelir (kaynak ve tarih sayfada yazar). Diğer kanallarda oranı satıcı panelinizden alıp girersiniz.` : 'Oranı pazaryerinin satıcı panelinde kendi kategoriniz için gördüğünüz gibi girersiniz. Kanal seçince gelen değerler resmî liste değil, örnek başlangıç değerleridir.'],
    ['Hesabı paylaşabilir ya da yazdırabilir miyim?', 'Evet. Her hesaplayıcının altındaki "Bağlantıyı kopyala" girdiğiniz değerlerle bir bağlantı oluşturur; "Yazdır" sonucu sade bir sayfa olarak yazdırır.'],
  ])}</div>
</section>
${toolCta}`;
    const ld = [{ '@type': 'ItemList', '@id': `${siteUrl}/araclar#list`, name: 'Ücretsiz e-ticaret hesaplama araçları', itemListElement: TOOLS.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name.replace(/^./, (x) => x.toLocaleUpperCase('tr')), url: `${siteUrl}/araclar/${t.slug}` })) }];
    return { meta: { title: title(`Ücretsiz E-Ticaret Hesaplama Araçları ${YEAR}`, 'araclar'), crumb: 'Araçlar', description: desc('Ücretsiz e-ticaret hesaplama araçları: Trendyol, Hepsiburada ve N11 komisyonu, KDV, desi, satış fiyatı, stopaj ve kâr karşılaştırma. Kayıt gerekmez.', 'araclar'), url: '/araclar', nav: 'araclar', modified: UPDATED, ld }, body, file: 'araclar.html' };
  }

  return { toolPage, ratePage, toolsIndex, toolCard, pages: () => [toolsIndex(), ...TOOLS.map(toolPage), ...Object.keys(comm).map(ratePage)] };
}
