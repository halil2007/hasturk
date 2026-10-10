// Otomatik blog: Claude (Anthropic API) her gün bir SEO yazısı TASLAĞI üretir; yönetici panelde okuyup yayınlar.
// Konu kuyruğu ve ayarlar settings.blog_auto'da; API anahtarı şifreli (channel_config 'ai', bkz. config.js → FIELDS.ai).
// Kuyruk boşsa konuyu model seçer (mevcut yazılarla çakışmayan, pazaryeri satıcılarının aradığı bir konu).
// Güncel bilgi (komisyon oranı, kural değişikliği) için web araması yapabilir; yazı strict "save_post" aracıyla teslim edilir.
// Yalnız ana panelde çalışır (müşteri panellerinde yoktur). Okunmamış otomatik taslak birikirse üretim durur (boşa maliyet olmasın).
import Anthropic from '@anthropic-ai/sdk';
import { all, first, run, getRaw, setSetting, notify } from './db.js';
import { loadConfig } from './config.js';
import { notify as pushNotify } from './push.js';
import { str } from './util.js';

export const MODEL = 'claude-opus-5-5';
// Tahmini maliyet (USD): Claude Opus 5.5 $4 / $20 per MTok; web araması $10 / 1000 arama
const PRICE = { in: 4 / 1e6, out: 20 / 1e6, search: 10 / 1000 };
const DAY = 864e5, TR = 3 * 3600e3;
export const MAX_PENDING = 7; // bu kadar okunmamış otomatik taslak varsa yenisi üretilmez
export const DEFAULTS = { enabled: false, hour: 9, topics: [], author: 'Hastürk CRM' };

// Sitenin iç bağlantı verilecek sayfaları (yazıda doğal yerlerde kullanılır)
const LINKS = [
  ['/entegrasyonlar/trendyol', 'Trendyol entegrasyonu'], ['/entegrasyonlar/hepsiburada', 'Hepsiburada entegrasyonu'], ['/entegrasyonlar/n11', 'N11 entegrasyonu'],
  ['/entegrasyonlar/ikas', 'ikas entegrasyonu'], ['/entegrasyonlar/pttavm', 'PttAVM entegrasyonu'], ['/entegrasyonlar/idefix', 'idefix entegrasyonu'],
  ['/entegrasyonlar/pazarama', 'Pazarama entegrasyonu'], ['/entegrasyonlar/woocommerce', 'WooCommerce entegrasyonu'], ['/entegrasyonlar', 'tüm entegrasyonlar'],
  ['/ozellikler/siparis-yonetimi', 'sipariş yönetimi'], ['/ozellikler/stok-senkronizasyonu', 'stok senkronizasyonu'], ['/ozellikler/kargo-ve-etiket', 'kargo etiketi'],
  ['/ozellikler/kargo-entegrasyonu', 'kargo firması entegrasyonu'], ['/ozellikler/urun-yonetimi', 'toplu ürün yükleme'], ['/ozellikler/buybox-takibi', 'buybox takibi'],
  ['/ozellikler/kar-zarar', 'kâr-zarar hesabı'], ['/ozellikler/raporlar', 'satış raporları'], ['/ozellikler/musteri-sorulari-ve-iadeler', 'müşteri soruları ve iadeler'],
  ['/paketler', 'fiyatlar'], ['/demo#deneme', '7 gün ücretsiz deneme'],
];

const SYSTEM = `Hastürk CRM'in blogu için Türkçe yazılar yazıyorsun. Hastürk CRM; Trendyol, Hepsiburada, N11, ikas, PttAVM, idefix, Pazarama ve WooCommerce gibi kanallarda satış yapan işletmelerin siparişlerini, stoklarını, fiyatlarını, kargo etiketlerini ve kârını tek panelden yönettiği bir pazaryeri entegrasyon yazılımı. Okurlar pazaryerlerinde satış yapan ya da yapmaya hazırlanan küçük ve orta ölçekli işletme sahipleri.

Amaç, Google'da bu okurların gerçekten aradığı bir soruya en iyi cevabı veren, özgün ve faydalı bir yazı. Reklam broşürü değil: okur yazıyı bitirdiğinde işine yarayan bir şey öğrenmiş olmalı.

- Dil sade, samimi ve Türkçe yazım kurallarına uygun olsun; "siz" diye hitap et. 1200–1800 kelime yeterli.
- Oran, ücret, tarih, kural gibi değişebilen bilgileri web aramasıyla doğrula. Doğrulayamadığın sayıyı yazma; gerekirse "güncel oranı satıcı panelinden kontrol edin" de. Kaynak sitelere bağlantı verebilirsin.
- Hastürk CRM'den yalnız konuyla gerçekten ilgili olduğu yerde, en fazla iki kez ve abartmadan söz et. Ürünün yapmadığı bir şeyi yapıyormuş gibi yazma. Yazının sonunda kısa bir çağrı olabilir (7 gün ücretsiz deneme).
- Uygun yerlerde sitenin şu sayfalarına site içi bağlantı ver (tam adres değil, / ile başlayan yol): ${LINKS.map(([u, t]) => `${u} (${t})`).join(', ')}.
- Biçim: Markdown'ın şu alt kümesi kullanılabilir: ## başlık, ### alt başlık, **kalın**, *eğik*, - madde, 1. sıralı madde, > alıntı, | tablo |, [bağlantı](adres). Başlık (#) satırı yazma; başlık ayrıca verilir. Ham HTML ve görsel kullanma.
- Yazının sonunda "## Sık sorulan sorular" bölümü olsun: 3–5 soru, her biri ### başlığıyla ve kısa cevapla.

Yazı hazır olunca save_post aracını çağırarak teslim et; yazıyı ayrıca düz metin olarak tekrar etme.`;

const SAVE_TOOL = {
  name: 'save_post',
  description: 'Bitmiş blog yazısını taslak olarak kaydeder. Yazı tamamlandığında bir kez çağrılır.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Sayfadaki başlık (H1), 40–80 karakter, aranan ifadeyi içersin' },
      seo_title: { type: 'string', description: 'Google sonuç başlığı, en fazla 60 karakter' },
      seo_desc: { type: 'string', description: 'Google sonuç açıklaması, 120–155 karakter, tıklamaya davet etsin' },
      summary: { type: 'string', description: 'Liste ve paylaşım için 1–2 cümlelik özet, en fazla 300 karakter' },
      tags: { type: 'array', items: { type: 'string' }, description: '2–5 kısa etiket (ör. Trendyol, Stok yönetimi)' },
      body: { type: 'string', description: 'Yazının gövdesi (Markdown alt kümesi; # başlık satırı olmadan)' },
    },
    required: ['title', 'seo_title', 'seo_desc', 'summary', 'tags', 'body'],
    additionalProperties: false,
  },
};

export async function apiKey(env, db) {
  const cfg = (await loadConfig(env, db)).ai;
  return str((cfg && cfg.values && cfg.values.ANTHROPIC_API_KEY) || env.ANTHROPIC_API_KEY);
}
export async function autoConfig(db) { return { ...DEFAULTS, ...((await getRaw(db, 'blog_auto')) || {}) }; }

// Bir yazı üret ve taslak olarak kaydet. topic boşsa model kendisi seçer. client: testlerde sahte istemci verilebilir.
export async function generatePost(env, db, { topic = '', client = null, author = 'Hastürk CRM' } = {}) {
  const key = client ? 'test' : await apiKey(env, db);
  if (!key) throw new Error('Anthropic API anahtarı girilmemiş: Blog → Otomatik yazı bölümüne girin');
  const ai = client || new Anthropic({ apiKey: key });
  const titles = (await all(db, 'SELECT title FROM blog_posts ORDER BY created_at DESC LIMIT 80')).map((r) => r.title);
  const ask = (topic ? `Konu: ${topic}` : 'Konuyu sen seç: pazaryeri satıcılarının Google\'da sık aradığı, aşağıdaki mevcut yazılarla çakışmayan, Hastürk CRM\'in çözdüğü sorunlara yakın bir konu.')
    + `\n\nBugünün tarihi: ${new Date(Date.now() + TR).toISOString().slice(0, 10)}.`
    + (titles.length ? `\n\nBlogdaki mevcut yazılar (aynı konuyu tekrar yazma, uygun olanlara /blog/… bağlantısı verme; yalnız site sayfalarına bağlantı ver):\n- ${titles.join('\n- ')}` : '');
  const messages = [{ role: 'user', content: ask }];
  const usage = { in: 0, out: 0, search: 0 };
  let post = null, nudged = false, model = MODEL;
  for (let turn = 0; turn < 8 && !post; turn++) {
    const stream = ai.beta.messages.stream({
      model: MODEL, max_tokens: 32000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'high' }, system: SYSTEM, messages,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5, user_location: { type: 'approximate', country: 'TR' } }, SAVE_TOOL],
      tool_choice: { type: 'auto' },
    });
    const msg = await stream.finalMessage();
    model = msg.model || model;
    usage.in += (msg.usage && (msg.usage.input_tokens || 0) + (msg.usage.cache_read_input_tokens || 0) + (msg.usage.cache_creation_input_tokens || 0)) || 0;
    usage.out += (msg.usage && msg.usage.output_tokens) || 0;
    usage.search += (msg.usage && msg.usage.server_tool_use && msg.usage.server_tool_use.web_search_requests) || 0;
    if (msg.stop_reason === 'refusal') throw new Error('Model bu konuda yazı yazmayı reddetti; konuyu değiştirin');
    const call = msg.content.find((b) => b.type === 'tool_use' && b.name === 'save_post');
    if (call) { post = call.input; break; }
    messages.push({ role: 'assistant', content: msg.content });
    // Sunucu tarafındaki arama döngüsü duraklattı: aynı geçmişle devam edilir (ek kullanıcı mesajı gerekmez)
    if (msg.stop_reason === 'pause_turn') continue;
    if (msg.stop_reason === 'max_tokens') throw new Error('Yazı çok uzun çıktı ve yarıda kesildi; tekrar deneyin');
    if (nudged) break;
    nudged = true;
    messages.push({ role: 'user', content: 'Yazıyı save_post aracıyla teslim et.' });
  }
  if (!post || str(post.body).length < 400) throw new Error('Model yazıyı teslim etmedi; tekrar deneyin');
  const cost = Math.round((usage.in * PRICE.in + usage.out * PRICE.out + usage.search * PRICE.search) * 1000) / 1000;
  const { insertPost } = await import('./blog.js');
  const r = await insertPost(db, {
    title: str(post.title).slice(0, 160), seo_title: str(post.seo_title).slice(0, 90), seo_desc: str(post.seo_desc).slice(0, 200),
    summary: str(post.summary).slice(0, 320), tags: (post.tags || []).slice(0, 5), body: String(post.body).replace(/^#\s[^\n]*\n+/, ''), status: 'draft', author,
  }, { name: author });
  await run(db, "UPDATE blog_posts SET ai = 1 WHERE id = ?", r.id);
  return { id: r.id, slug: r.slug, title: str(post.title), topic, cost, usage, model };
}

// Zamanlanmış tetik (ana panelin 15 dakikalık senkronu): açıksa, saat geldiyse ve bugün üretilmediyse bir yazı üretir
export async function blogAutoTick(env, db, { now = Date.now(), client = null } = {}) {
  if (env.TENANT_SLUG) return null;
  const cfg = await autoConfig(db);
  if (!cfg.enabled) return null;
  const day = new Date(now + TR).toISOString().slice(0, 10), hour = new Date(now + TR).getUTCHours();
  const st = (await getRaw(db, 'blog_auto_state')) || {};
  if (st.day === day || hour < (Number(cfg.hour) || 0)) return null;
  if (!client && !(await apiKey(env, db))) return null;
  // Okunmamış (hiç düzenlenmemiş) otomatik taslak birikmişse durur
  const pending = (await first(db, "SELECT COUNT(*) AS n FROM blog_posts WHERE ai = 1 AND status = 'draft'")).n || 0;
  if (pending >= MAX_PENDING) {
    if (st.paused !== day) {
      await setSetting(db, 'blog_auto_state', { ...st, paused: day });
      await notify(db, 'blog-ai-paused', { level: 'warn', title: `Otomatik blog durdu: ${pending} taslak onay bekliyor`, msg: 'Bekleyen taslakları yayınlayın ya da silin; üretim ertesi gün kendiliğinden devam eder.' });
    }
    return { skipped: 'pending' };
  }
  // Aynı gün iki kez üretilmesin (eşzamanlı tetikler): gün önce işaretlenir
  const claim = await first(db, `INSERT INTO settings (k, v) VALUES ('blog_auto_day', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v WHERE settings.v != excluded.v RETURNING v`, JSON.stringify(day));
  if (!claim) return null;
  return runOnce(env, db, cfg, { client, day });
}

// Kuyruktaki sıradaki konuyla bir yazı (kuyruk boşsa model seçer); sonuç kaydı, bildirim
export async function runOnce(env, db, cfg, { client = null, day = new Date(Date.now() + TR).toISOString().slice(0, 10), topic: forced } = {}) {
  const queue = Array.isArray(cfg.topics) ? cfg.topics.map(str).filter(Boolean) : [];
  const topic = forced != null ? str(forced) : queue[0] || '';
  const st = (await getRaw(db, 'blog_auto_state')) || {};
  try {
    const r = await generatePost(env, db, { topic, client, author: cfg.author || DEFAULTS.author });
    if (forced == null && queue.length) await setSetting(db, 'blog_auto', { ...cfg, topics: queue.slice(1) });
    const hist = [{ at: Date.now(), id: r.id, title: r.title, topic, cost: r.cost }, ...(st.history || [])].slice(0, 30);
    await setSetting(db, 'blog_auto_state', { ...st, day, last: hist[0], history: hist, error: null });
    await notify(db, `blog-ai:${r.id}`, { level: 'info', title: `Yeni blog taslağı hazır: ${r.title}`, msg: 'Blog sayfasından okuyup düzenleyin, uygunsa yayınlayın.' });
    await pushNotify(db, { title: '📝 Blog taslağı hazır', body: r.title, url: `#/blog/${r.id}` }).catch(() => {});
    return r;
  } catch (e) {
    await setSetting(db, 'blog_auto_state', { ...st, day, error: { at: Date.now(), msg: String(e.message || e).slice(0, 400), topic } });
    await notify(db, 'blog-ai-error', { level: 'error', title: 'Otomatik blog yazısı üretilemedi', msg: String(e.message || e).slice(0, 400) });
    throw e;
  }
}
